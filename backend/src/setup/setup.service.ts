import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { Role, UserState } from '@game-ledger/contract';
import { CreateFirstUserDto } from './setup.dto';

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  /** Returns true if the install wizard has already been completed. */
  async isSetupComplete(): Promise<boolean> {
    const settings = await this.prisma.globalSetting.findUnique({
      where: { id: 1 },
    });
    return !!settings?.setupCompletedAt;
  }

  async getStatus(): Promise<{ setupComplete: boolean }> {
    return { setupComplete: await this.isSetupComplete() };
  }

  /**
   * Run the one-time install wizard.
   * Creates the first SUPER_ADMIN user and marks setup as complete.
   * Throws ConflictException if setup is already done.
   */
  async runSetup(dto: CreateFirstUserDto): Promise<{ id: string; email: string }> {
    if (await this.isSetupComplete()) {
      throw new ConflictException(
        'Setup has already been completed. The install wizard can only run once.',
      );
    }

    // Double-check: if a SUPER_ADMIN already exists somehow, reject.
    const existingSuperAdmin = await this.prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
    });
    if (existingSuperAdmin) {
      throw new ConflictException('A Super Admin already exists. Setup cannot run again.');
    }

    // Validate password policy.
    const policyResult = this.passwordService.validatePolicy(dto.password);
    if (!policyResult.valid) {
      throw new BadRequestException(policyResult.errors.join(' '));
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    // Use a transaction to create user + mark setup complete atomically.
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          fullName: dto.fullName,
          nickname: dto.nickname,
          passwordHash,
          role: Role.SUPER_ADMIN,
          state: UserState.ACTIVE,
        },
      });

      // Create self-Player for the super admin
      await tx.player.create({
        data: {
          nickname: dto.nickname,
          userId: newUser.id,
          createdById: newUser.id,
        },
      });

      await tx.globalSetting.upsert({
        where: { id: 1 },
        create: { id: 1, setupCompletedAt: new Date() },
        update: { setupCompletedAt: new Date() },
      });

      return newUser;
    });

    return { id: user.id, email: user.email };
  }
}
