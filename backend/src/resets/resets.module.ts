import { Module } from '@nestjs/common';
import { ResetsService } from './resets.service';
import { ResetsController, UserResetLinkController } from './resets.controller';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RbacModule, AuditModule, AuthModule],
  controllers: [ResetsController, UserResetLinkController],
  providers: [ResetsService],
  exports: [ResetsService],
})
export class ResetsModule {}
