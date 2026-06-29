/**
 * GamesService — game lifecycle, event write model, and result resolution.
 *
 * Key invariants:
 * - Only the scorekeeper (creator) may write events or finish a game.
 * - Events are append-only; ScoreState is a derived materialization.
 * - Idempotency: re-posting the same clientEventId returns the same result without re-applying.
 * - Optimistic concurrency: baseVersion must match the game's current max seq.
 */
import { Prisma } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuleLoaderService } from '../module-loader/module-loader.service';
import {
  getScoringType,
  getRankOrderScoringType,
  getWinnerPickScoringType,
  RoundEntry,
  FinishOrderEntry,
  WinnerPickEntry,
  ScoringTypeConfig,
} from '../scoring/scoring-type.registry';
import { CreateGameDto, PostEventDto } from './games.dto';

// ─── Internal types ───────────────────────────────────────────────────────────

/** Shape of the ScoreState.payload stored in the DB. */
interface ScoreStatePayload {
  rounds: Array<{
    round: number;
    scores: Record<string, number>;
  }>;
  totals: Record<string, number>;
}

/** Shape of a round_score event payload. */
interface RoundScorePayload {
  round: number;
  scores: Array<{
    participationId: string;
    roundScore: number;
    endedRound: boolean;
  }>;
}

/** Shape of a finish_order event payload (for rank_order games). */
interface FinishOrderPayload {
  order: Array<{
    participationId: string;
    rank: number; // 1 = first place
  }>;
}

/** Shape of a winner_pick event payload. */
interface WinnerPickEventPayload {
  round: number;
  /** The participationId of the player who won this round. */
  winnerId: string;
  /** All participants in the game (needed to emit 0-scores for non-winners). */
  participationIds: string[];
}

/** Shape of the ScoreState.payload for winner_pick games. */
interface WinnerPickScoreStatePayload {
  /** Distinct key from numeric_rounds' "rounds" to avoid ambiguity in the frontend. */
  winnerPickRounds: Array<{
    round: number;
    winnerId: string;
  }>;
  totals: Record<string, number>;
}

/** Shape of the ScoreState.payload for rank_order games. */
interface RankOrderScoreStatePayload {
  finishOrder: Array<{ participationId: string; rank: number }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLoader: ModuleLoaderService,
  ) {}

  // ─── Create game ──────────────────────────────────────────────────────────

  /**
   * POST /api/games — create a new game.
   *
   * Validates player count against the module definition. The creator is the scorekeeper.
   */
  async createGame(dto: CreateGameDto, creatorId: string) {
    // Resolve the module.
    const moduleDef = dto.moduleKey.includes('@')
      ? this.moduleLoader.getModule(...(dto.moduleKey.split('@') as [string, string]))
      : this.moduleLoader.getLatestModule(dto.moduleKey);

    if (!moduleDef) {
      throw new NotFoundException(`Game module "${dto.moduleKey}" is not loaded.`);
    }

    // Validate player count.
    const count = dto.participantPlayerIds.length;
    if (count < moduleDef.players.min || count > moduleDef.players.max) {
      throw new BadRequestException(
        `"${moduleDef.name}" requires ${moduleDef.players.min}–${moduleDef.players.max} players, got ${count}.`,
      );
    }

    // Verify all players exist.
    const players = await this.prisma.player.findMany({
      where: { id: { in: dto.participantPlayerIds } },
      select: { id: true },
    });
    if (players.length !== dto.participantPlayerIds.length) {
      throw new NotFoundException('One or more player IDs not found.');
    }

    // Create the game + participations atomically.
    const game = await this.prisma.game.create({
      data: {
        moduleKey: moduleDef.id,
        moduleVersion: moduleDef.version,
        scoringTypeId: moduleDef.scoringType.id,
        scoringTypeVersion: moduleDef.scoringType.version,
        playgroupId: dto.playgroupId ?? null,
        createdById: creatorId,
        config: (dto.config ?? {}) as unknown as Prisma.InputJsonValue,
        participations: {
          create: dto.participantPlayerIds.map((playerId, i) => ({
            playerId,
            seat: i + 1,
          })),
        },
      },
      include: {
        participations: { include: { player: { select: { id: true, nickname: true } } } },
      },
    });

    return game;
  }

  // ─── List games ───────────────────────────────────────────────────────────

  /**
   * GET /api/games — list caller's games (active + complete).
   */
  async listGames(callerId: string) {
    // Find player IDs for this user.
    const callerPlayers = await this.prisma.player.findMany({
      where: { OR: [{ userId: callerId }, { createdById: callerId }] },
      select: { id: true },
    });
    const callerPlayerIds = callerPlayers.map((p) => p.id);

    const games = await this.prisma.game.findMany({
      where: {
        OR: [
          { createdById: callerId },
          { participations: { some: { playerId: { in: callerPlayerIds } } } },
        ],
      },
      include: {
        participations: { include: { player: { select: { id: true, nickname: true } } } },
      },
      orderBy: { startedAt: 'desc' },
    });

    return games;
  }

  // ─── Get game ─────────────────────────────────────────────────────────────

  /**
   * GET /api/games/:id — game detail with current ScoreState + version.
   */
  async getGame(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participations: {
          include: {
            player: { select: { id: true, nickname: true } },
            scoreState: true,
          },
        },
      },
    });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);

    const version = await this.currentVersion(gameId);

    return { ...game, version };
  }

  // ─── Post event ───────────────────────────────────────────────────────────

  /**
   * POST /api/games/:id/events — append an event.
   *
   * Enforces:
   * - Only scorekeeper may write.
   * - Idempotency on clientEventId.
   * - Optimistic concurrency on baseVersion.
   */
  async postEvent(gameId: string, dto: PostEventDto, actorId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { participations: true },
    });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);
    if (game.status !== 'ACTIVE') {
      throw new BadRequestException(`Game ${gameId} is not active.`);
    }

    // Only the scorekeeper (creator) may write.
    if (game.createdById !== actorId) {
      throw new ForbiddenException('Only the scorekeeper may write events.');
    }

    // Idempotency: check if this clientEventId was already applied.
    const existing = await this.prisma.gameEvent.findUnique({
      where: { clientEventId: dto.clientEventId },
    });
    if (existing) {
      // Return current canonical state without re-applying.
      const version = await this.currentVersion(gameId);
      const scoreStates = await this.prisma.scoreState.findMany({
        where: { gameId },
      });
      return { idempotent: true, version, scoreStates };
    }

    // Optimistic concurrency.
    const currentSeq = await this.currentVersion(gameId);
    if (dto.baseVersion !== currentSeq) {
      const scoreStates = await this.prisma.scoreState.findMany({
        where: { gameId },
      });
      throw new ConflictException({
        message: 'Stale baseVersion — another event was written concurrently.',
        currentVersion: currentSeq,
        scoreStates,
      });
    }

    const newSeq = currentSeq + 1;

    // Append event.
    const event = await this.prisma.gameEvent.create({
      data: {
        gameId,
        seq: newSeq,
        authorPlayerId: null, // scorekeeper writes on behalf of all
        type: dto.type,
        payload: dto.payload as unknown as Prisma.InputJsonValue,
        clientEventId: dto.clientEventId,
      },
    });

    // Update materialized ScoreState.
    const scoreStates = await this.updateScoreState(game, dto.type);

    return { event, version: newSeq, scoreStates };
  }

  // ─── Get events ───────────────────────────────────────────────────────────

  /**
   * GET /api/games/:id/events — ordered event log.
   */
  async getEvents(gameId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);

    return this.prisma.gameEvent.findMany({
      where: { gameId },
      orderBy: { seq: 'asc' },
    });
  }

  // ─── Finish game ──────────────────────────────────────────────────────────

  /**
   * POST /api/games/:id/finish — run final scoring resolution.
   *
   * Writes GameResult rows, sets game COMPLETE + endedAt.
   */
  async finishGame(gameId: string, actorId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { participations: true },
    });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);
    if (game.status !== 'ACTIVE') {
      throw new BadRequestException(`Game ${gameId} is not active.`);
    }
    if (game.createdById !== actorId) {
      throw new ForbiddenException('Only the scorekeeper may finish a game.');
    }

    // Load all events and replay.
    const events = await this.prisma.gameEvent.findMany({
      where: { gameId },
      orderBy: { seq: 'asc' },
    });

    const moduleDef = this.moduleLoader.getModule(game.moduleKey, game.moduleVersion);
    if (!moduleDef) {
      throw new BadRequestException(`Module "${game.moduleKey}@${game.moduleVersion}" not loaded.`);
    }

    const config = (moduleDef.scoringType.config ?? {}) as unknown as ScoringTypeConfig;

    // Route to the appropriate scoring type.
    const rankOrderSt = getRankOrderScoringType(game.scoringTypeId, game.scoringTypeVersion);
    const winnerPickSt = getWinnerPickScoringType(game.scoringTypeId, game.scoringTypeVersion);

    const resolved = rankOrderSt
      ? rankOrderSt.resolveFinishOrder(this.replayFinishOrder(events), config)
      : winnerPickSt
        ? winnerPickSt.resolveWinnerPick(
            this.replayWinnerPickRounds(events, game.participations),
            config,
          )
        : (() => {
            const st = getScoringType(game.scoringTypeId, game.scoringTypeVersion);
            if (!st) {
              throw new BadRequestException(
                `Scoring type "${game.scoringTypeId}@${game.scoringTypeVersion}" not registered.`,
              );
            }
            return st.resolve(this.replayRounds(events), config);
          })();

    // Write results + mark COMPLETE atomically.
    const [updatedGame] = await this.prisma.$transaction([
      this.prisma.game.update({
        where: { id: gameId },
        data: { status: 'COMPLETE', endedAt: new Date() },
      }),
      ...game.participations.map((p) => {
        const rankEntry = resolved.ranks.find((r) => r.participationId === p.id);
        return this.prisma.gameResult.upsert({
          where: { participationId: p.id },
          create: {
            gameId,
            participationId: p.id,
            rank: rankEntry?.rank ?? null,
            didWin: rankEntry?.didWin ?? false,
            score: rankEntry?.score ?? null,
            normalized: resolved as unknown as Prisma.InputJsonValue,
          },
          update: {
            rank: rankEntry?.rank ?? null,
            didWin: rankEntry?.didWin ?? false,
            score: rankEntry?.score ?? null,
            normalized: resolved as unknown as Prisma.InputJsonValue,
          },
        });
      }),
    ]);

    return { game: updatedGame, resolved };
  }

  // ─── Cancel game ─────────────────────────────────────────────────────────────

  /**
   * POST /api/games/:id/cancel — abandon an active game (creator-only).
   *
   * Sets status ABANDONED + endedAt. Does NOT delete the record.
   * 403 if the caller is not the game creator.
   */
  async cancelGame(gameId: string, actorId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);
    if (game.createdById !== actorId) {
      throw new ForbiddenException('Only the game creator can cancel this game.');
    }
    if (game.status !== 'ACTIVE') {
      throw new BadRequestException(`Game ${gameId} is not active.`);
    }

    return this.prisma.game.update({
      where: { id: gameId },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });
  }

  // ─── Delete game ─────────────────────────────────────────────────────────────

  /**
   * DELETE /api/games/:id — hard-delete a game and all child rows (creator-only).
   *
   * Deletes in FK-safe order: gameResult, scoreState, gameEvent, participation, game.
   * 403 if the caller is not the game creator.
   */
  async deleteGame(gameId: string, actorId: string) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);
    if (game.createdById !== actorId) {
      throw new ForbiddenException('Only the game creator can delete this game.');
    }

    await this.prisma.$transaction([
      this.prisma.gameResult.deleteMany({ where: { gameId } }),
      this.prisma.scoreState.deleteMany({ where: { gameId } }),
      this.prisma.gameEvent.deleteMany({ where: { gameId } }),
      this.prisma.participation.deleteMany({ where: { gameId } }),
      this.prisma.game.delete({ where: { id: gameId } }),
    ]);

    return { deleted: true };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /** Current game version = max seq (0 if no events). */
  async currentVersion(gameId: string): Promise<number> {
    const result = await this.prisma.gameEvent.aggregate({
      where: { gameId },
      _max: { seq: true },
    });
    return result._max.seq ?? 0;
  }

  // ─── Undo last round ─────────────────────────────────────────────────────

  /**
   * POST /api/games/:id/undo-last-round — delete the most recent scoring event
   * (round_score or winner_pick) and re-materialize ScoreState. Creator-only.
   *
   * Uses hard-delete of the latest round event rather than a compensating event.
   * Safe in Phase 1 (single scorekeeper): no concurrent writers, and ScoreState
   * is always derived by replaying remaining events.
   */
  async undoLastRound(gameId: string, actorId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { participations: true },
    });
    if (!game) throw new NotFoundException(`Game ${gameId} not found.`);
    if (game.status !== 'ACTIVE') {
      throw new BadRequestException(`Game ${gameId} is not active.`);
    }
    if (game.createdById !== actorId) {
      throw new ForbiddenException('Only the scorekeeper may undo rounds.');
    }

    const allEvents = await this.prisma.gameEvent.findMany({
      where: { gameId },
      orderBy: { seq: 'asc' },
    });

    // Find the last round_score or winner_pick event.
    const scoringEvents = allEvents.filter(
      (e) => e.type === 'round_score' || e.type === 'winner_pick',
    );

    if (scoringEvents.length === 0) {
      const version = await this.currentVersion(gameId);
      const scoreStates = await this.prisma.scoreState.findMany({ where: { gameId } });
      return { undone: false, reason: 'no_rounds', version, scoreStates };
    }

    // Determine the event type from the last scoring event.
    const lastEvent = scoringEvents[scoringEvents.length - 1];
    const lastEventType = lastEvent.type;

    let idsToDelete: bigint[];
    if (lastEventType === 'round_score') {
      const lastRound = (lastEvent.payload as unknown as RoundScorePayload).round;
      idsToDelete = scoringEvents
        .filter(
          (e) =>
            e.type === 'round_score' &&
            (e.payload as unknown as RoundScorePayload).round === lastRound,
        )
        .map((e) => e.id);
    } else {
      // winner_pick — delete the last round's event
      const lastRound = (lastEvent.payload as unknown as WinnerPickEventPayload).round;
      idsToDelete = scoringEvents
        .filter(
          (e) =>
            e.type === 'winner_pick' &&
            (e.payload as unknown as WinnerPickEventPayload).round === lastRound,
        )
        .map((e) => e.id);
    }

    await this.prisma.gameEvent.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    const scoreStates = await this.updateScoreState(game, lastEventType);
    const newVersion = await this.currentVersion(gameId);
    return { undone: true, version: newVersion, scoreStates };
  }

  /**
   * Update the materialized ScoreState after appending an event.
   * Handles `round_score` (numeric_rounds), `finish_order` (rank_order),
   * and `winner_pick` event types.
   */
  private async updateScoreState(
    game: { id: string; participations: Array<{ id: string; playerId: string }> },
    eventType: string,
  ) {
    if (eventType === 'winner_pick') {
      // Load all events to rebuild winner_pick state.
      const allEvents = await this.prisma.gameEvent.findMany({
        where: { gameId: game.id },
        orderBy: { seq: 'asc' },
      });

      // Accumulate winner_pick rounds and totals.
      const roundsMap = new Map<number, string>(); // round → winnerId
      for (const event of allEvents) {
        if (event.type !== 'winner_pick') continue;
        const p = event.payload as unknown as WinnerPickEventPayload;
        roundsMap.set(p.round, p.winnerId);
      }

      // Compute totals from winner_pick rounds.
      const totals: Record<string, number> = {};
      for (const p of game.participations) {
        totals[p.id] = 0;
      }
      const winnerPickRounds: WinnerPickScoreStatePayload['winnerPickRounds'] = [];
      for (const [roundNum, winnerId] of [...roundsMap.entries()].sort(([a], [b]) => a - b)) {
        winnerPickRounds.push({ round: roundNum, winnerId });
        totals[winnerId] = (totals[winnerId] ?? 0) + 1;
      }

      const statePayload: WinnerPickScoreStatePayload = { winnerPickRounds, totals };

      const upserts = game.participations.map((p) =>
        this.prisma.scoreState.upsert({
          where: { participationId: p.id },
          create: {
            gameId: game.id,
            participationId: p.id,
            payload: statePayload as unknown as Prisma.InputJsonValue,
          },
          update: {
            payload: statePayload as unknown as Prisma.InputJsonValue,
          },
        }),
      );
      return this.prisma.$transaction(upserts);
    }

    if (eventType === 'finish_order') {
      // Load all events to rebuild rank_order state.
      const allEvents = await this.prisma.gameEvent.findMany({
        where: { gameId: game.id },
        orderBy: { seq: 'asc' },
      });

      // Extract the latest finish_order event (M1: single-round, last one wins).
      let finishOrder: Array<{ participationId: string; rank: number }> = [];
      for (const event of allEvents) {
        if (event.type !== 'finish_order') continue;
        const p = event.payload as unknown as FinishOrderPayload;
        finishOrder = p.order;
      }

      const statePayload: RankOrderScoreStatePayload = { finishOrder };

      const upserts = game.participations.map((p) =>
        this.prisma.scoreState.upsert({
          where: { participationId: p.id },
          create: {
            gameId: game.id,
            participationId: p.id,
            payload: statePayload as unknown as Prisma.InputJsonValue,
          },
          update: {
            payload: statePayload as unknown as Prisma.InputJsonValue,
          },
        }),
      );
      return this.prisma.$transaction(upserts);
    }

    if (eventType !== 'round_score') {
      // Unknown event type — no score state change.
      return this.prisma.scoreState.findMany({ where: { gameId: game.id } });
    }

    // Load all events (including the just-appended one) to rebuild state.
    const allEvents = await this.prisma.gameEvent.findMany({
      where: { gameId: game.id },
      orderBy: { seq: 'asc' },
    });

    // Compute totals without resolvers — raw sums for ScoreState materialization.
    // For the materialized state we store raw round scores + running totals.
    const totals: Record<string, number> = {};
    const roundsPayload: ScoreStatePayload['rounds'] = [];

    // Collect raw scores per round from events (already includes the new event).
    const rawRoundMap = new Map<number, Record<string, number>>();
    for (const event of allEvents) {
      if (event.type !== 'round_score') continue;
      const p = event.payload as unknown as RoundScorePayload;
      if (!rawRoundMap.has(p.round)) rawRoundMap.set(p.round, {});
      const roundScores = rawRoundMap.get(p.round)!;
      for (const s of p.scores) {
        roundScores[s.participationId] = s.roundScore;
      }
    }

    // Build ordered rounds payload and compute totals.
    for (const [roundNum, scores] of [...rawRoundMap.entries()].sort(([a], [b]) => a - b)) {
      roundsPayload.push({ round: roundNum, scores });
      for (const [pid, score] of Object.entries(scores)) {
        totals[pid] = (totals[pid] ?? 0) + score;
      }
    }

    const statePayload: ScoreStatePayload = { rounds: roundsPayload, totals };

    // Upsert one ScoreState row per participation.
    const upserts = game.participations.map((p) => {
      return this.prisma.scoreState.upsert({
        where: { participationId: p.id },
        create: {
          gameId: game.id,
          participationId: p.id,
          payload: statePayload as unknown as Prisma.InputJsonValue,
        },
        update: {
          payload: statePayload as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return this.prisma.$transaction(upserts);
  }

  /**
   * Replay all events to produce a rounds array for the scoring type.
   * This is a pure re-derivation — should always equal the materialized state.
   */
  replayRounds(events: Array<{ type: string; payload: unknown }>): RoundEntry[][] {
    const roundMap = new Map<number, RoundEntry[]>();

    for (const event of events) {
      if (event.type !== 'round_score') continue;
      const p = event.payload as RoundScorePayload;
      if (!roundMap.has(p.round)) roundMap.set(p.round, []);
      const roundEntries = roundMap.get(p.round)!;
      for (const s of p.scores) {
        roundEntries.push({
          participationId: s.participationId,
          roundScore: s.roundScore,
          endedRound: s.endedRound,
        });
      }
    }

    // Return rounds in order.
    return [...roundMap.entries()].sort(([a], [b]) => a - b).map(([, entries]) => entries);
  }

  /**
   * Replay finish_order events to produce the final finish order for rank_order scoring.
   * M1: single-round — last finish_order event wins (scorekeeper can correct if needed).
   */
  replayFinishOrder(events: Array<{ type: string; payload: unknown }>): FinishOrderEntry[] {
    let result: FinishOrderEntry[] = [];
    for (const event of events) {
      if (event.type !== 'finish_order') continue;
      const p = event.payload as FinishOrderPayload;
      result = p.order.map((o) => ({ participationId: o.participationId, rank: o.rank }));
    }
    return result;
  }

  /**
   * Replay winner_pick events into WinnerPickEntry[][] for the winner_pick scoring type.
   * Each round becomes an array of entries: winner gets score=1, others get score=0.
   */
  replayWinnerPickRounds(
    events: Array<{ type: string; payload: unknown }>,
    participations: Array<{ id: string }>,
  ): WinnerPickEntry[][] {
    const roundMap = new Map<number, string>(); // round → winnerId

    for (const event of events) {
      if (event.type !== 'winner_pick') continue;
      const p = event.payload as WinnerPickEventPayload;
      roundMap.set(p.round, p.winnerId);
    }

    const participationIds = participations.map((p) => p.id);

    return [...roundMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, winnerId]) =>
        participationIds.map((pid) => ({
          participationId: pid,
          winnerId,
          score: pid === winnerId ? 1 : 0,
        })),
      );
  }
}
