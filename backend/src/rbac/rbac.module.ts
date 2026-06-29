import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';
import { AuthGuard } from './auth.guard';
import { SessionService } from '../auth/session.service';
import { CsrfGuard } from '../auth/csrf.guard';
import { CsrfService } from '../auth/csrf.service';

@Module({
  providers: [
    PermissionService,
    PermissionsGuard,
    AuthGuard,
    SessionService,
    CsrfGuard,
    CsrfService,
  ],
  exports: [PermissionService, PermissionsGuard, AuthGuard, SessionService, CsrfGuard, CsrfService],
})
export class RbacModule {}
