// ModuleLoaderService: loads YAML game-module definitions on startup.
// On bootstrap: scans modules/*/module.yaml, parses with js-yaml,
// validates against JSON Schema, upserts into game_modules table,
// and registers in-memory registry keyed by moduleKey+version.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { load as yamlLoad } from 'js-yaml';
import Ajv from 'ajv';
import { MODULE_SCHEMA } from '@game-ledger/contract';
import { PrismaService } from '../prisma/prisma.service';
import {
  getScoringType,
  getRankOrderScoringType,
  getWinnerPickScoringType,
} from '../scoring/scoring-type.registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  players: { min: number; max: number };
  scoringType: {
    id: string;
    version: string;
    config?: Record<string, unknown>;
  };
  end: {
    type: string;
    target?: number;
    finishRound?: boolean;
    rounds?: number;
  };
  result: { type: string };
  fields?: Array<{ name: string; type: string; label?: string; required?: boolean }>;
  info?: Record<string, string>;
  [key: string]: unknown;
}

/** A `ModuleDefinition` augmented with the caller's hosted-game play count. */
export interface ModuleWithPlayCount extends ModuleDefinition {
  playCount: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ModuleLoaderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ModuleLoaderService.name);
  private readonly ajv = new Ajv({ strict: false });
  private readonly validate = this.ajv.compile(MODULE_SCHEMA);

  // In-memory registry: "moduleKey@version" => ModuleDefinition
  private readonly modules = new Map<string, ModuleDefinition>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.loadModules();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Look up a loaded module definition by key + version. */
  getModule(moduleKey: string, version: string): ModuleDefinition | undefined {
    return this.modules.get(`${moduleKey}@${version}`);
  }

  /** Get the latest version of a module (by key), or undefined. */
  getLatestModule(moduleKey: string): ModuleDefinition | undefined {
    for (const [key, def] of this.modules.entries()) {
      if (key.startsWith(`${moduleKey}@`)) return def;
    }
    return undefined;
  }

  /** List all loaded module definitions. */
  listModules(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  /**
   * List all loaded module definitions, each annotated with `playCount`:
   * the number of games the given user has hosted (created) for that module.
   *
   * Versioned `moduleKey`s stored in Game rows (e.g. `skyjo@1`) are rolled up
   * to the base key (`skyjo`) to match each module's `id`.
   */
  async listModulesWithPlayCounts(userId: string): Promise<ModuleWithPlayCount[]> {
    const grouped = await this.prisma.game.groupBy({
      by: ['moduleKey'],
      where: { createdById: userId },
      _count: { _all: true },
    });

    // Roll up versioned keys (e.g. "skyjo@1" → "skyjo") into a base-key count map.
    const countByBaseKey = new Map<string, number>();
    for (const row of grouped) {
      const baseKey = row.moduleKey.split('@')[0];
      countByBaseKey.set(baseKey, (countByBaseKey.get(baseKey) ?? 0) + row._count._all);
    }

    return this.listModules().map((mod) => ({
      ...mod,
      playCount: countByBaseKey.get(mod.id) ?? 0,
    }));
  }

  // ─── Loader ─────────────────────────────────────────────────────────────────

  /** Load all modules from disk and register them. Also exposed for testing. */
  async loadModules(modulesDir?: string): Promise<void> {
    const dir = modulesDir ?? this.resolveModulesDir();

    if (!fs.existsSync(dir)) {
      this.logger.warn(`Modules directory not found: ${dir}`);
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const moduleDirs = entries.filter((e) => e.isDirectory());

    for (const entry of moduleDirs) {
      const yamlPath = path.join(dir, entry.name, 'module.yaml');
      if (!fs.existsSync(yamlPath)) {
        this.logger.warn(`No module.yaml in ${entry.name}, skipping.`);
        continue;
      }
      await this.loadOneModule(yamlPath);
    }

    this.logger.log(`Loaded ${this.modules.size} game module(s).`);
  }

  /**
   * Load, validate, and register a single module YAML file.
   * Throws on validation error to prevent startup with a bad module.
   */
  async loadOneModule(yamlPath: string): Promise<ModuleDefinition> {
    const raw = fs.readFileSync(yamlPath, 'utf8');
    const parsed = yamlLoad(raw) as unknown;

    // JSON Schema validation.
    const valid = this.validate(parsed);
    if (!valid) {
      const errors = this.ajv.errorsText(this.validate.errors);
      throw new Error(`Invalid module YAML at ${yamlPath}: ${errors}`);
    }

    const def = parsed as ModuleDefinition;

    // Verify the referenced scoring type exists in the code registry.
    const st =
      getScoringType(def.scoringType.id, def.scoringType.version) ??
      getRankOrderScoringType(def.scoringType.id, def.scoringType.version) ??
      getWinnerPickScoringType(def.scoringType.id, def.scoringType.version);
    if (!st) {
      throw new Error(
        `Module "${def.id}" references unknown scoring type ` +
          `"${def.scoringType.id}@${def.scoringType.version}". ` +
          `Register it in scoring-type.registry.ts first.`,
      );
    }

    // Upsert into DB.
    await this.prisma.gameModule.upsert({
      where: { moduleKey_version: { moduleKey: def.id, version: def.version } },
      create: {
        moduleKey: def.id,
        version: def.version,
        name: def.name,
        definition: def as unknown as import('@prisma/client').Prisma.InputJsonValue,
        scoringTypeId: def.scoringType.id,
        scoringTypeVersion: def.scoringType.version,
      },
      update: {
        name: def.name,
        definition: def as unknown as import('@prisma/client').Prisma.InputJsonValue,
        scoringTypeId: def.scoringType.id,
        scoringTypeVersion: def.scoringType.version,
      },
    });

    // Register in memory.
    this.modules.set(`${def.id}@${def.version}`, def);
    this.logger.log(`Module "${def.id}@${def.version}" (${def.name}) loaded.`);

    return def;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private resolveModulesDir(): string {
    // From backend/dist/module-loader (compiled) or backend/src/module-loader (ts-jest),
    // go up 4 levels to reach the monorepo root, then into modules/.
    return path.resolve(__dirname, '../../../modules');
  }
}
