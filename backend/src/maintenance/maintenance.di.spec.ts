import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { MaintenanceService } from './maintenance.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DI-resolution regression test. The unit specs construct MaintenanceService
 * directly (`new MaintenanceService(...)`), which bypasses Nest's injector and
 * therefore never validates that the service can actually be resolved by the
 * container the way AppModule resolves it at boot.
 *
 * Two things must hold and previously did not:
 *  1. The optional constructor params (ExecRunner/FsAdapter/scheduler) must not
 *     make Nest try (and fail) to resolve a `Function`/`Object` provider — they
 *     are `@Optional()`.
 *  2. The scheduler param is `@Inject(SchedulerRegistry)` so the REAL registry
 *     from ScheduleModule is wired in — otherwise scheduled backups/reindex
 *     would silently never fire in production.
 */
describe('MaintenanceService — Nest container resolution', () => {
  it('resolves through the Nest injector with the real SchedulerRegistry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        MaintenanceService,
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    const svc = moduleRef.get(MaintenanceService);
    expect(svc).toBeInstanceOf(MaintenanceService);

    // The real SchedulerRegistry must be available in the same context so the
    // service receives it (not the no-op fallback adapter).
    const registry = moduleRef.get(SchedulerRegistry);
    expect(registry).toBeInstanceOf(SchedulerRegistry);
  });
});
