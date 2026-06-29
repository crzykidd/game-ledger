/**
 * Unit tests for ModuleLoaderService.listModulesWithPlayCounts().
 *
 * All Prisma calls are mocked — no DB required.
 * The module registry is populated via loadModules() pointing at the real
 * modules directory so we always test against real module ids.
 */
import * as path from 'path';
import { ModuleLoaderService } from './module-loader.service';

const MODULES_DIR = path.resolve(__dirname, '../../../modules');

// ─── Fake PrismaService ───────────────────────────────────────────────────────

function makePrisma(groupByRows: { moduleKey: string; _count: { _all: number } }[]) {
  return {
    gameModule: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    game: {
      groupBy: jest.fn().mockResolvedValue(groupByRows),
    },
  };
}

// ─── Helper: boot a service with a given groupBy result ───────────────────────

async function makeService(
  groupByRows: { moduleKey: string; _count: { _all: number } }[],
): Promise<ModuleLoaderService> {
  const mockPrisma = makePrisma(groupByRows);
  const svc = new ModuleLoaderService(mockPrisma as any);
  await svc.loadModules(MODULES_DIR);
  return svc;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ModuleLoaderService.listModulesWithPlayCounts()', () => {
  it('returns playCount: 0 for every module when the user has no hosted games', async () => {
    const svc = await makeService([]);
    const modules = await svc.listModulesWithPlayCounts('user-1');

    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) {
      expect(mod.playCount).toBe(0);
    }
  });

  it('reports the correct count for a module the user has hosted N times', async () => {
    const svc = await makeService([
      { moduleKey: 'skyjo', _count: { _all: 5 } },
    ]);

    const modules = await svc.listModulesWithPlayCounts('user-1');
    const skyjo = modules.find((m) => m.id === 'skyjo');

    expect(skyjo).toBeDefined();
    expect(skyjo!.playCount).toBe(5);
  });

  it('every returned module has a playCount field (additive, existing fields untouched)', async () => {
    const svc = await makeService([
      { moduleKey: 'uno', _count: { _all: 3 } },
    ]);

    const modules = await svc.listModulesWithPlayCounts('user-1');

    for (const mod of modules) {
      expect(typeof mod.playCount).toBe('number');
      // Existing fields are still present
      expect(mod.id).toBeDefined();
      expect(mod.name).toBeDefined();
      expect(mod.version).toBeDefined();
      expect(mod.players).toBeDefined();
      expect(mod.scoringType).toBeDefined();
    }
  });

  it('rolls up versioned moduleKeys (skyjo@1, skyjo@2) to the base module id', async () => {
    const svc = await makeService([
      { moduleKey: 'skyjo@1', _count: { _all: 4 } },
      { moduleKey: 'skyjo@2', _count: { _all: 7 } },
    ]);

    const modules = await svc.listModulesWithPlayCounts('user-1');
    const skyjo = modules.find((m) => m.id === 'skyjo');

    expect(skyjo).toBeDefined();
    expect(skyjo!.playCount).toBe(11); // 4 + 7
  });

  it('only counts the current user games (groupBy is called with createdById filter)', async () => {
    const mockPrisma = makePrisma([{ moduleKey: 'skyjo', _count: { _all: 2 } }]);
    const svc = new ModuleLoaderService(mockPrisma as any);
    await svc.loadModules(MODULES_DIR);

    await svc.listModulesWithPlayCounts('user-abc');

    expect(mockPrisma.game.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdById: 'user-abc' },
      }),
    );
  });

  it('a module with no games reports 0 while a module with games reports its count', async () => {
    const svc = await makeService([
      { moduleKey: 'skyjo', _count: { _all: 9 } },
    ]);

    const modules = await svc.listModulesWithPlayCounts('user-1');

    const skyjo = modules.find((m) => m.id === 'skyjo');
    const uno = modules.find((m) => m.id === 'uno');

    expect(skyjo!.playCount).toBe(9);
    expect(uno!.playCount).toBe(0);
  });

  it('handles multiple modules with counts simultaneously', async () => {
    const svc = await makeService([
      { moduleKey: 'skyjo', _count: { _all: 3 } },
      { moduleKey: 'uno', _count: { _all: 7 } },
      { moduleKey: 'hearts', _count: { _all: 1 } },
    ]);

    const modules = await svc.listModulesWithPlayCounts('user-1');
    const byId = Object.fromEntries(modules.map((m) => [m.id, m.playCount]));

    expect(byId['skyjo']).toBe(3);
    expect(byId['uno']).toBe(7);
    expect(byId['hearts']).toBe(1);
    expect(byId['five-crowns']).toBe(0);
  });
});
