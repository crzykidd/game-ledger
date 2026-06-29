/**
 * Play API — players, playgroups, games, events.
 * postEvent uses raw fetch to capture the full 409 body (currentVersion + scoreStates),
 * which ApiClient.post() would discard. All other calls use the singleton apiClient.
 */
import { apiClient } from './client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  nickname: string;
  userId: string | null;
}

export interface PlaygroupMember {
  player: Player;
}

export interface Playgroup {
  id: string;
  name: string;
  members: PlaygroupMember[];
}

export interface ScoreStatePayload {
  // numeric_rounds state
  rounds?: Array<{ round: number; scores: Record<string, number> }>;
  totals?: Record<string, number>;
  // rank_order state
  finishOrder?: Array<{ participationId: string; rank: number }>;
  // winner_pick state — rounds stores { round, winnerId }
  winnerPickRounds?: Array<{ round: number; winnerId: string }>;
}

export interface Participation {
  id: string;
  seat: number;
  player: Player;
  scoreState?: { payload: ScoreStatePayload } | null;
}

export interface GameSummary {
  id: string;
  moduleKey: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  createdById?: string;
  participations: Participation[];
}

export interface GameDetail extends GameSummary {
  version: number;
}

export interface ResolvedRank {
  participationId: string;
  rank: number | null;
  didWin: boolean;
  score: number | null;
}

export interface FinishResult {
  game: { id: string; status: string };
  resolved: { ranks: ResolvedRank[] };
}

export interface EventResult {
  event?: unknown;
  idempotent?: boolean;
  version: number;
  scoreStates: Array<{ participationId: string; payload: ScoreStatePayload }>;
}

export interface ConflictError {
  currentVersion: number;
  scoreStates: Array<{ participationId: string; payload: ScoreStatePayload }>;
}

export class StaleVersionError extends Error {
  constructor(
    public currentVersion: number,
    public scoreStates: Array<{ participationId: string; payload: ScoreStatePayload }>,
  ) {
    super('Stale version');
    this.name = 'StaleVersionError';
  }
}

// ─── Helper: read CSRF cookie ──────────────────────────────────────────────────

function getCsrfToken(): string | undefined {
  const match = document.cookie.split('; ').find((row) => row.startsWith('gl_csrf='));
  return match ? match.split('=')[1] : undefined;
}

// ─── Module types ──────────────────────────────────────────────────────────────

export interface ModuleFieldDef {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
}

export interface PerRoundConfig {
  round: number;
  wildRank: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  players: { min: number; max: number };
  end: { type: string; target?: number; finishRound?: boolean; rounds?: number };
  fields?: ModuleFieldDef[];
  perRoundConfig?: PerRoundConfig[];
  scoringType: {
    id: string;
    version: string;
    config?: {
      direction?: string;
      aggregate?: string;
      pointsMap?: Record<string, number>;
    };
  };
  result?: { type: string };
  info?: { summary?: string; rules?: string; scoring?: string };
  playCount?: number;
  maturity?: 'released' | 'pre_release';
}

// ─── Modules API ───────────────────────────────────────────────────────────────

export function listModules(): Promise<ModuleInfo[]> {
  return apiClient.get<ModuleInfo[]>('/api/modules');
}

// ─── Players API ───────────────────────────────────────────────────────────────

export function listPlayers(): Promise<Player[]> {
  return apiClient.get<Player[]>('/api/players');
}

export function createPlayer(nickname: string): Promise<Player> {
  return apiClient.post<Player>('/api/players', { nickname });
}

export function renamePlayer(id: string, nickname: string): Promise<Player> {
  return apiClient.patch<Player>(`/api/players/${id}`, { nickname });
}

// ─── Playgroups API ────────────────────────────────────────────────────────────

export function listPlaygroups(): Promise<Playgroup[]> {
  return apiClient.get<Playgroup[]>('/api/playgroups');
}

export function createPlaygroup(name: string, memberPlayerIds?: string[]): Promise<Playgroup> {
  return apiClient.post<Playgroup>('/api/playgroups', { name, memberPlayerIds });
}

export function renamePlaygroup(id: string, name: string): Promise<Playgroup> {
  return apiClient.patch<Playgroup>(`/api/playgroups/${id}`, { name });
}

export function addPlaygroupMember(playgroupId: string, playerId: string): Promise<Playgroup> {
  return apiClient.post<Playgroup>(`/api/playgroups/${playgroupId}/members/${playerId}`);
}

export function removePlaygroupMember(playgroupId: string, playerId: string): Promise<Playgroup> {
  return apiClient.delete<Playgroup>(`/api/playgroups/${playgroupId}/members/${playerId}`);
}

// ─── Games API ─────────────────────────────────────────────────────────────────

export function listGames(): Promise<GameSummary[]> {
  return apiClient.get<GameSummary[]>('/api/games');
}

export function getGame(id: string): Promise<GameDetail> {
  return apiClient.get<GameDetail>(`/api/games/${id}`);
}

export function createGame(body: {
  moduleKey: string;
  playgroupId?: string;
  participantPlayerIds: string[];
  config?: Record<string, unknown>;
}): Promise<GameDetail> {
  return apiClient.post<GameDetail>('/api/games', body);
}

/**
 * Post a game event. Uses raw fetch so the full 409 body (currentVersion + scoreStates)
 * can be read. ApiClient.post() only extracts statusCode/message/field from error bodies.
 */
export async function postEvent(
  gameId: string,
  body: {
    clientEventId: string;
    baseVersion: number;
    type: string;
    payload: Record<string, unknown>;
  },
): Promise<EventResult> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(`/api/games/${gameId}/events`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    const conflictBody = (await res.json()) as ConflictError;
    throw new StaleVersionError(conflictBody.currentVersion, conflictBody.scoreStates);
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      typeof errorBody.message === 'string' ? errorBody.message : `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<EventResult>;
}

export function finishGame(gameId: string): Promise<FinishResult> {
  return apiClient.post<FinishResult>(`/api/games/${gameId}/finish`);
}

export function cancelGame(gameId: string): Promise<GameSummary> {
  return apiClient.post<GameSummary>(`/api/games/${gameId}/cancel`);
}

export function deleteGame(gameId: string): Promise<{ deleted: boolean }> {
  return apiClient.delete<{ deleted: boolean }>(`/api/games/${gameId}`);
}

// ─── Undo last round ───────────────────────────────────────────────────────────

export interface UndoResult {
  undone: boolean;
  reason?: string;
  version: number;
  scoreStates: Array<{ participationId: string; payload: ScoreStatePayload }>;
}

export async function undoLastRound(gameId: string): Promise<UndoResult> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(`/api/games/${gameId}/undo-last-round`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      typeof errorBody.message === 'string' ? errorBody.message : `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<UndoResult>;
}
