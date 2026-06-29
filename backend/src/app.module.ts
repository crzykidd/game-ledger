import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SetupModule } from './setup/setup.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { GroupsModule } from './groups/groups.module';
import { UsersModule } from './users/users.module';
import { InvitesModule } from './invites/invites.module';
import { ResetsModule } from './resets/resets.module';
import { PlayersModule } from './players/players.module';
import { ModuleLoaderModule } from './module-loader/module-loader.module';
import { GamesModule } from './games/games.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { FeedbackModule } from './feedback/feedback.module';

@Module({
  imports: [
    // Config — loads .env / process.env
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting — default: 100 req / 60s per IP
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // 60 s window
        limit: 100,
      },
      // Stricter limit for auth endpoints (applied via @Throttle decorator)
      {
        name: 'auth',
        ttl: 60_000,
        limit: 10,
      },
      // Feedback submission limit (~5/min per IP)
      {
        name: 'feedback',
        ttl: 60_000,
        limit: 5,
      },
    ]),

    PrismaModule,
    HealthModule,
    RbacModule,
    AuthModule,
    SetupModule,
    AuditModule,
    GroupsModule,
    UsersModule,
    InvitesModule,
    ResetsModule,
    PlayersModule,
    ModuleLoaderModule,
    GamesModule,
    MaintenanceModule,
    FeedbackModule,
  ],
})
export class AppModule {}
