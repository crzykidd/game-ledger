import React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/ui/Toast';
import { StartGamePage } from './StartGamePage';
import { GamePage } from './GamePage';
import { ResultsPage } from './ResultsPage';
import { HistoryPage } from './HistoryPage';
import { SkyjoReference } from './SkyjoReference';
import { GameSummary } from '../api/play';
import { getDealerIndex, CribbageCapture } from './capture/CribbageCapture';
import { getCaptureComponent } from './capture';

// ─── Module mock data ──────────────────────────────────────────────────────────

function skyjoModuleInfo() {
  return {
    id: 'skyjo',
    name: 'Skyjo',
    version: '1.0.0',
    players: { min: 2, max: 8 },
    end: { type: 'target', target: 100, finishRound: true },
    fields: [
      { name: 'roundScore', type: 'integer', label: 'Round Score', required: true },
      { name: 'endedRound', type: 'boolean', label: 'Ended Round', required: true },
    ],
    scoringType: {
      id: 'numeric_rounds',
      version: '1.0.0',
      config: { direction: 'low', aggregate: 'sum' },
    },
    info: { summary: 'Skyjo summary', scoring: 'Skyjo scoring ref' },
    maturity: 'released' as const,
  };
}

function unoModuleInfo() {
  return {
    id: 'uno',
    name: 'Uno',
    version: '1.0.0',
    players: { min: 2, max: 10 },
    end: { type: 'target', target: 500, finishRound: true },
    fields: [{ name: 'roundScore', type: 'integer', label: 'Round Score', required: true }],
    scoringType: {
      id: 'numeric_rounds',
      version: '1.0.0',
      config: { direction: 'high', aggregate: 'sum' },
    },
    info: { summary: 'Uno summary', scoring: 'Uno scoring ref' },
    maturity: 'released' as const,
  };
}

function fiveCrownsModuleInfo() {
  return {
    id: 'five-crowns',
    name: 'Five Crowns',
    version: '1.0.0',
    players: { min: 1, max: 7 },
    end: { type: 'fixed_rounds', rounds: 11 },
    fields: [{ name: 'roundScore', type: 'integer', label: 'Penalty Points', required: true }],
    perRoundConfig: [
      { round: 1, wildRank: '3s' },
      { round: 2, wildRank: '4s' },
      { round: 3, wildRank: '5s' },
      { round: 4, wildRank: '6s' },
      { round: 5, wildRank: '7s' },
      { round: 6, wildRank: '8s' },
      { round: 7, wildRank: '9s' },
      { round: 8, wildRank: '10s' },
      { round: 9, wildRank: 'Jacks' },
      { round: 10, wildRank: 'Queens' },
      { round: 11, wildRank: 'Kings' },
    ],
    scoringType: {
      id: 'numeric_rounds',
      version: '1.0.0',
      config: { direction: 'low', aggregate: 'sum' },
    },
    info: { summary: 'Five Crowns summary', scoring: 'Five Crowns scoring ref' },
    maturity: 'released' as const,
  };
}

// ─── Shared mock data ──────────────────────────────────────────────────────────

function baseUser() {
  return {
    id: 'user-1',
    email: 'player@example.com',
    nickname: 'alice',
    fullName: 'Alice',
    role: 'PLAYER',
    state: 'ACTIVE',
    themePref: 'SYSTEM',
    effectivePermissions: ['CREATE_GAME'],
  };
}

function basePlayer(id: string, nickname: string, userId: string | null = null) {
  return { id, nickname, userId };
}

function baseParticipation(id: string, seat: number, playerId: string, nickname: string) {
  return {
    id,
    seat,
    player: { id: playerId, nickname, userId: null },
    scoreState: null,
  };
}

function participationWithScore(
  id: string,
  seat: number,
  playerId: string,
  nickname: string,
  rounds: Array<{ round: number; scores: Record<string, number> }>,
  totals: Record<string, number>,
) {
  return {
    id,
    seat,
    player: { id: playerId, nickname, userId: null },
    scoreState: {
      payload: { rounds, totals },
    },
  };
}

function baseActiveGame(id: string, version = 1) {
  return {
    id,
    moduleKey: 'skyjo',
    status: 'ACTIVE',
    startedAt: '2026-06-24T10:00:00Z',
    endedAt: null,
    version,
    // Match the logged-in user id from baseUser() so creator actions show
    createdById: 'user-1',
    participations: [
      baseParticipation('part-1', 0, 'player-1', 'alice'),
      baseParticipation('part-2', 1, 'player-2', 'bob'),
    ],
  };
}

function gameWithScoreState(id: string, version = 2) {
  const rounds = [
    { round: 1, scores: { 'part-1': 10, 'part-2': 5 } },
    { round: 2, scores: { 'part-1': 8, 'part-2': 12 } },
  ];
  return {
    id,
    moduleKey: 'skyjo',
    status: 'ACTIVE',
    startedAt: '2026-06-24T10:00:00Z',
    endedAt: null,
    version,
    participations: [
      participationWithScore('part-1', 0, 'player-1', 'alice', rounds, {
        'part-1': 18,
        'part-2': 17,
      }),
      participationWithScore('part-2', 1, 'player-2', 'bob', rounds, {
        'part-1': 18,
        'part-2': 17,
      }),
    ],
  };
}

// ─── Setup helpers ─────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handler: (url: string, opts?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const body = handler(url, opts);
      if (body === null) {
        return {
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({ statusCode: 403, message: 'Forbidden' }),
        };
      }
      if (body instanceof Response) return body;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body,
      };
    }),
  );
}

function renderWithProviders(element: React.ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
        <AuthProvider>{element}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

// ─── Test 1: Start-game flow posts the right body ─────────────────────────────

// ─── Test 1: Start-game — dropdown ordering (most-played-first then alpha) ────

describe('Play: start-game — dropdown order', () => {
  it('game dropdown options are sorted most-played-first then alphabetical', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/players') {
        return {
          ok: true,
          status: 200,
          json: async () => [basePlayer('p-1', 'alice'), basePlayer('p-2', 'bob')],
        };
      }
      if (url === '/api/playgroups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === '/api/modules') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { ...skyjoModuleInfo(), playCount: 5 },
            { ...unoModuleInfo(), playCount: 10 },
            { ...fiveCrownsModuleInfo(), playCount: 5 },
          ],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/new']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/new" element={<StartGamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for modules to load (placeholder + 3 modules = 4 options)
    await waitFor(() => {
      const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
      expect(gameSelect.options.length).toBe(4);
    });

    const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
    const optionTexts = Array.from(gameSelect.options)
      .slice(1) // skip placeholder
      .map((o) => o.text);

    // Uno has playCount 10 → first
    expect(optionTexts[0]).toMatch(/Uno/);
    // Five Crowns and Skyjo both have playCount 5 → alphabetical: Five Crowns before Skyjo
    expect(optionTexts[1]).toMatch(/Five Crowns/);
    expect(optionTexts[2]).toMatch(/Skyjo/);
  });
});

// ─── Test 2: Count buttons and seat dropdowns ─────────────────────────────────

describe('Play: start-game — count buttons and seat dropdowns', () => {
  it('selecting a game renders count buttons min-max; choosing N renders N seat selects', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/players') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            basePlayer('p-1', 'alice'),
            basePlayer('p-2', 'bob'),
            basePlayer('p-3', 'carol'),
          ],
        };
      }
      if (url === '/api/playgroups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/new']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/new" element={<StartGamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for modules to load
    await waitFor(() => {
      expect((screen.getByLabelText('Game') as HTMLSelectElement).options.length).toBeGreaterThan(
        1,
      );
    });

    // No count buttons yet
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();

    // Select Skyjo (min 2, max 8)
    await userEvent.selectOptions(screen.getByLabelText('Game'), 'skyjo');

    // Count buttons 2–8 should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    });
    for (let n = 2; n <= 8; n++) {
      expect(screen.getByRole('button', { name: String(n) })).toBeInTheDocument();
    }
    // Count button 1 (below min) and 9 (above max) should not exist
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9' })).not.toBeInTheDocument();

    // No seat dropdowns yet (no count chosen)
    expect(screen.queryByLabelText('Seat 1')).not.toBeInTheDocument();

    // Click count button "3"
    await userEvent.click(screen.getByRole('button', { name: '3' }));

    // 3 seat selects should appear
    await waitFor(() => {
      expect(screen.getByLabelText('Seat 1')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Seat 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Seat 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Seat 4')).not.toBeInTheDocument();
  });
});

// ─── Test 3: Player dedupe across slots ──────────────────────────────────────

describe('Play: start-game — player dedupe', () => {
  it('a player chosen in one slot is not offered in other slots', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/players') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            basePlayer('p-1', 'alice'),
            basePlayer('p-2', 'bob'),
            basePlayer('p-3', 'carol'),
          ],
        };
      }
      if (url === '/api/playgroups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/new']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/new" element={<StartGamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Game') as HTMLSelectElement).options.length).toBeGreaterThan(
        1,
      );
    });

    await userEvent.selectOptions(screen.getByLabelText('Game'), 'skyjo');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Seat 1')).toBeInTheDocument();
    });

    // Assign alice (p-1) to seat 1
    await userEvent.selectOptions(screen.getByLabelText('Seat 1'), 'p-1');

    // Seat 2 should NOT offer alice as an option
    const slot2 = screen.getByLabelText('Seat 2') as HTMLSelectElement;
    const slot2Values = Array.from(slot2.options).map((o) => o.value);
    expect(slot2Values).not.toContain('p-1');

    // Seat 2 should still offer bob and carol
    expect(slot2Values).toContain('p-2');
    expect(slot2Values).toContain('p-3');
  });
});

// ─── Test 4: Playgroup pre-fills slots; Start posts in slot order ─────────────

describe('Play: start-game — playgroup pre-fill and submit', () => {
  it('selecting a playgroup pre-fills slots; Start posts participantPlayerIds in slot order', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/players') {
        return {
          ok: true,
          status: 200,
          json: async () => [basePlayer('p-1', 'alice'), basePlayer('p-2', 'bob')],
        };
      }
      if (url === '/api/playgroups') {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'pg-1',
              name: 'Team Alpha',
              members: [
                { player: basePlayer('p-1', 'alice') },
                { player: basePlayer('p-2', 'bob') },
              ],
            },
          ],
        };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'game-new',
            moduleKey: 'skyjo',
            status: 'ACTIVE',
            startedAt: new Date().toISOString(),
            version: 0,
            participations: [],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/new']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/new" element={<StartGamePage />} />
              <Route path="/play/:id" element={<div data-testid="game-page">game</div>} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for data to load
    await waitFor(() => {
      expect((screen.getByLabelText('Game') as HTMLSelectElement).options.length).toBeGreaterThan(
        1,
      );
    });

    // Select Skyjo
    await userEvent.selectOptions(screen.getByLabelText('Game'), 'skyjo');

    // Playgroup select should appear
    await waitFor(() => {
      expect(screen.getByLabelText('Playgroup (optional)')).toBeInTheDocument();
    });

    // Select the playgroup
    await userEvent.selectOptions(screen.getByLabelText('Playgroup (optional)'), 'pg-1');

    // Slots should be pre-filled with alice and bob (in order)
    await waitFor(() => {
      expect((screen.getByLabelText('Seat 1') as HTMLSelectElement).value).toBe('p-1');
      expect((screen.getByLabelText('Seat 2') as HTMLSelectElement).value).toBe('p-2');
    });

    // Start game button should be enabled
    const startBtn = screen.getByRole('button', { name: 'Start game' });
    expect(startBtn).not.toBeDisabled();

    // Click Start
    await userEvent.click(startBtn);

    // Verify POST body has participantPlayerIds in slot order [alice, bob]
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const createCall = calls.find(([u, o]) => u === '/api/games' && o?.method === 'POST');
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1].body as string);
      expect(body.moduleKey).toBe('skyjo');
      expect(body.participantPlayerIds[0]).toBe('p-1'); // alice first
      expect(body.participantPlayerIds[1]).toBe('p-2'); // bob second
    });
  });
});

// ─── Test 5: Start disabled until all slots filled ────────────────────────────

describe('Play: start-game — Start disabled until all slots filled', () => {
  it('Start is disabled until every seat has a player assigned', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/players') {
        return {
          ok: true,
          status: 200,
          json: async () => [basePlayer('p-1', 'alice'), basePlayer('p-2', 'bob')],
        };
      }
      if (url === '/api/playgroups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/new']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/new" element={<StartGamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Game') as HTMLSelectElement).options.length).toBeGreaterThan(
        1,
      );
    });

    const startBtn = screen.getByRole('button', { name: 'Start game' });

    // No game, no count → disabled
    expect(startBtn).toBeDisabled();

    // Select game → still disabled (no count)
    await userEvent.selectOptions(screen.getByLabelText('Game'), 'skyjo');
    expect(startBtn).toBeDisabled();

    // Choose count 2 → still disabled (slots empty)
    await waitFor(() => expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(screen.getByLabelText('Seat 1')).toBeInTheDocument());
    expect(startBtn).toBeDisabled();

    // Fill seat 1 only → still disabled
    await userEvent.selectOptions(screen.getByLabelText('Seat 1'), 'p-1');
    expect(startBtn).toBeDisabled();

    // Fill seat 2 → enabled
    await userEvent.selectOptions(screen.getByLabelText('Seat 2'), 'p-2');
    expect(startBtn).not.toBeDisabled();
  });
});

// ─── Test 2: Score entry submits event; totals update ─────────────────────────

describe('Play: score entry', () => {
  it('submits event with clientEventId + baseVersion; totals update from response', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'test-uuid-1234-5678-abcd-ef0123456789' as ReturnType<typeof crypto.randomUUID>,
    );

    const updatedScoreStates = [
      {
        participationId: 'part-1',
        payload: {
          rounds: [{ round: 1, scores: { 'part-1': 10, 'part-2': 5 } }],
          totals: { 'part-1': 10, 'part-2': 5 },
        },
      },
      {
        participationId: 'part-2',
        payload: {
          rounds: [{ round: 1, scores: { 'part-1': 10, 'part-2': 5 } }],
          totals: { 'part-1': 10, 'part-2': 5 },
        },
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-1') {
        return { ok: true, status: 200, json: async () => baseActiveGame('game-1', 1) };
      }
      if (url === '/api/games/game-1/events' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 2,
            scoreStates: updatedScoreStates,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-1']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load — score inputs appear once the game loads
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Fill in scores
    const scoreInputs = screen.getAllByPlaceholderText('Score');
    await userEvent.clear(scoreInputs[0]);
    await userEvent.type(scoreInputs[0], '10');
    await userEvent.clear(scoreInputs[1]);
    await userEvent.type(scoreInputs[1], '5');

    // Save
    await userEvent.click(screen.getByRole('button', { name: 'Save Round' }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const eventCall = calls.find(
        ([u, o]) => u === '/api/games/game-1/events' && o?.method === 'POST',
      );
      expect(eventCall).toBeTruthy();
      const body = JSON.parse(eventCall![1].body as string);
      expect(body.clientEventId).toBe('test-uuid-1234-5678-abcd-ef0123456789');
      expect(body.baseVersion).toBe(1);
    });

    // Totals should update in the UI
    await waitFor(() => {
      // Totals table should show updated scores — alice: 10, bob: 5
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});

// ─── Test 3: 409 stale-version reloads state ──────────────────────────────────

describe('Play: 409 stale-version handling', () => {
  it('shows stale version toast and reloads game state on 409', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'test-uuid-stale-0000-0000-000000000000' as ReturnType<typeof crypto.randomUUID>,
    );

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-2') {
        return { ok: true, status: 200, json: async () => baseActiveGame('game-2', 1) };
      }
      if (url === '/api/games/game-2/events' && opts?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            message: 'Stale version',
            currentVersion: 2,
            scoreStates: [
              { participationId: 'part-1', payload: { rounds: [], totals: { 'part-1': 0 } } },
              { participationId: 'part-2', payload: { rounds: [], totals: { 'part-2': 0 } } },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-2']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load — score inputs appear once the game loads
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Fill scores and save
    const scoreInputs = screen.getAllByPlaceholderText('Score');
    await userEvent.clear(scoreInputs[0]);
    await userEvent.type(scoreInputs[0], '5');
    await userEvent.clear(scoreInputs[1]);
    await userEvent.type(scoreInputs[1], '8');

    await userEvent.click(screen.getByRole('button', { name: 'Save Round' }));

    // Toast about stale version should appear
    await waitFor(() => {
      expect(screen.getByText(/stale version|reloading/i)).toBeInTheDocument();
    });

    // Game should be reloaded (GET /api/games/game-2 called again)
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const getCalls = calls.filter(([u]) => u === '/api/games/game-2');
      expect(getCalls.length).toBeGreaterThan(1);
    });

    // Component should not crash — game page title is still visible
    expect(screen.getByText(/Skyjo — Round/i)).toBeInTheDocument();
  });
});

// ─── Test 4: Resume loads active game state ───────────────────────────────────

describe('Play: resume game', () => {
  it('loads game with 2 rounds played and shows round 3 as current', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-resume') {
        return { ok: true, status: 200, json: async () => gameWithScoreState('game-resume', 2) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-resume']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Should show Round 3 (2 rounds played, next is 3)
    await waitFor(() => {
      expect(screen.getByText(/Skyjo — Round 3/i)).toBeInTheDocument();
    });

    // Totals should be shown: alice=18, bob=17
    await waitFor(() => {
      expect(screen.getByText('18')).toBeInTheDocument();
      expect(screen.getByText('17')).toBeInTheDocument();
    });
  });
});

// ─── Test 5: Results page shows correct low-wins winner ───────────────────────

describe('Play: results page', () => {
  it('shows winner name in heading and rank 1 = lowest score', async () => {
    const finishResult = {
      game: { id: 'game-done', status: 'COMPLETE' },
      resolved: {
        ranks: [
          { participationId: 'part-a', rank: 1, didWin: true, score: 45 },
          { participationId: 'part-b', rank: 2, didWin: false, score: 72 },
          { participationId: 'part-c', rank: 3, didWin: false, score: 88 },
        ],
      },
    };

    const gameDetail = {
      id: 'game-done',
      moduleKey: 'skyjo',
      status: 'COMPLETE',
      startedAt: '2026-06-24T10:00:00Z',
      version: 5,
      participations: [
        {
          id: 'part-a',
          seat: 0,
          player: { id: 'p-a', nickname: 'carol', userId: null },
          scoreState: { payload: { rounds: [], totals: { 'part-a': 45 } } },
        },
        {
          id: 'part-b',
          seat: 1,
          player: { id: 'p-b', nickname: 'dave', userId: null },
          scoreState: { payload: { rounds: [], totals: { 'part-b': 72 } } },
        },
        {
          id: 'part-c',
          seat: 2,
          player: { id: 'p-c', nickname: 'eve', userId: null },
          scoreState: { payload: { rounds: [], totals: { 'part-c': 88 } } },
        },
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-done') {
        return { ok: true, status: 200, json: async () => gameDetail };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/play/game-done/results', state: { result: finishResult } }]}
      >
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id/results" element={<ResultsPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Winner name in heading
    await waitFor(() => {
      expect(screen.getByText(/carol wins!/i)).toBeInTheDocument();
    });

    // Rankings: rank 1 = carol (lowest score 45)
    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('carol')).toBeInTheDocument();
    });

    // Score 45 appears (lowest)
    expect(screen.getByText('45')).toBeInTheDocument();
  });
});

// ─── Test 5b: Results page empty state ───────────────────────────────────────

describe('Play: results page empty state', () => {
  it('shows empty state when ranks is empty (no results yet)', async () => {
    // Simulate a completed game that has no participations (edge case)
    const gameDetail = {
      id: 'game-empty',
      moduleKey: 'skyjo',
      status: 'COMPLETE',
      startedAt: '2026-06-24T10:00:00Z',
      version: 1,
      participations: [],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-empty') {
        return { ok: true, status: 200, json: async () => gameDetail };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/play/game-empty/results', state: null }]}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id/results" element={<ResultsPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('No results yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Results will appear here once the game is finished.'),
    ).toBeInTheDocument();
  });
});

// ─── Test 6: History + SkyjoReference ────────────────────────────────────────

describe('Play: history page', () => {
  beforeEach(() => {
    // Silence any clipboard errors
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it('lists games with module name from metadata, no SkyjoReference widget', async () => {
    const activeGame: GameSummary = {
      id: 'g-active',
      moduleKey: 'skyjo',
      status: 'ACTIVE',
      startedAt: '2026-06-24T09:00:00Z',
      endedAt: null,
      participations: [
        {
          id: 'part-1',
          seat: 0,
          player: { id: 'p-1', nickname: 'alice', userId: null },
          scoreState: null,
        },
      ],
    };
    const completedGame: GameSummary = {
      id: 'g-done',
      moduleKey: 'skyjo',
      status: 'COMPLETE',
      startedAt: '2026-06-23T09:00:00Z',
      endedAt: '2026-06-23T10:00:00Z',
      participations: [
        {
          id: 'part-2',
          seat: 0,
          player: { id: 'p-1', nickname: 'alice', userId: null },
          scoreState: null,
        },
        {
          id: 'part-3',
          seat: 1,
          player: { id: 'p-2', nickname: 'bob', userId: null },
          scoreState: null,
        },
      ],
    };

    stubFetch((url) => {
      if (url === '/api/auth/me') return baseUser();
      if (url === '/api/games') return [activeGame, completedGame];
      if (url === '/api/modules') return [skyjoModuleInfo()];
      return {};
    });

    renderWithProviders(<HistoryPage />, '/history');

    // Both games should be listed with "Skyjo" from module metadata (not hardcoded)
    await waitFor(() => {
      expect(screen.getAllByText('Skyjo').length).toBeGreaterThanOrEqual(2);
    });

    // Active and Complete badges should appear (using getAllByText since 'Active' also appears as a tab)
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Complete')).toBeInTheDocument();

    // The SkyjoReference widget should NOT appear on the history page
    expect(document.querySelector('.skyjo-reference')).toBeNull();
  });

  it('shows Abandoned badge for abandoned games and Delete button for creator', async () => {
    const abandonedGame: GameSummary = {
      id: 'g-abandoned',
      moduleKey: 'skyjo',
      status: 'ABANDONED',
      startedAt: '2026-06-24T08:00:00Z',
      endedAt: '2026-06-24T09:00:00Z',
      createdById: 'user-1', // same as baseUser().id
      participations: [
        {
          id: 'part-ab',
          seat: 0,
          player: { id: 'p-1', nickname: 'alice', userId: null },
          scoreState: null,
        },
      ],
    };

    stubFetch((url) => {
      if (url === '/api/auth/me') return baseUser();
      if (url === '/api/games') return [abandonedGame];
      if (url === '/api/modules') return [skyjoModuleInfo()];
      return {};
    });

    renderWithProviders(<HistoryPage />, '/history');

    // Wait for abandoned game badge to appear (might have multiple 'Abandoned' — tab + badge)
    await waitFor(() => {
      expect(screen.getAllByText('Abandoned').length).toBeGreaterThanOrEqual(1);
    });

    // Creator should see a Delete button
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument();
  });

  it('SkyjoReference renders collapsed by default and expands on click', async () => {
    renderWithProviders(<SkyjoReference />, '/');

    // "Scoring Reference" button should be visible even collapsed
    expect(screen.getByText('Scoring Reference')).toBeInTheDocument();

    // The scoring content should NOT be visible yet
    expect(screen.queryByText(/Doubling Rule/i)).not.toBeInTheDocument();

    // Click to expand
    await userEvent.click(screen.getByText('Scoring Reference'));

    // Now the reference text should appear
    await waitFor(() => {
      expect(screen.getByText(/Doubling Rule/i)).toBeInTheDocument();
    });
  });
});

// ─── Test 7: Capture-driven entry — Uno has no ended-round toggle ─────────────

describe('Play: capture-driven entry — module-driven fields', () => {
  it('renders only roundScore field for Uno (no Ended round toggle)', async () => {
    const unoGame = {
      id: 'game-uno',
      moduleKey: 'uno',
      status: 'ACTIVE',
      startedAt: '2026-06-24T10:00:00Z',
      endedAt: null,
      version: 1,
      participations: [
        baseParticipation('part-u1', 0, 'player-u1', 'alice'),
        baseParticipation('part-u2', 1, 'player-u2', 'bob'),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [unoModuleInfo()] };
      }
      if (url === '/api/games/game-uno') {
        return { ok: true, status: 200, json: async () => unoGame };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-uno']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load — score inputs appear
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Score inputs should be present
    expect(screen.getAllByPlaceholderText('Score')).toHaveLength(2);

    // "Ended round" / flag toggle must NOT appear for Uno (no endedRound field)
    expect(screen.queryByText(/ended round/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/this player ended the round/i)).not.toBeInTheDocument();
  });

  it('shows wild rank hint for Five Crowns on round 1', async () => {
    const fiveCrownsGame = {
      id: 'game-fc',
      moduleKey: 'five-crowns',
      status: 'ACTIVE',
      startedAt: '2026-06-24T10:00:00Z',
      endedAt: null,
      version: 1,
      participations: [
        baseParticipation('part-fc1', 0, 'player-fc1', 'alice'),
        baseParticipation('part-fc2', 1, 'player-fc2', 'bob'),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [fiveCrownsModuleInfo()] };
      }
      if (url === '/api/games/game-fc') {
        return { ok: true, status: 200, json: async () => fiveCrownsGame };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-fc']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Wild rank hint for round 1 should show "3s"
    await waitFor(() => {
      expect(screen.getByText(/Wild this round: 3s/i)).toBeInTheDocument();
    });

    // No "Ended round" toggle for Five Crowns either
    expect(screen.queryByText(/ended round/i)).not.toBeInTheDocument();
  });
});

// ─── Test 8: rank_order module renders finish-order UI (not numeric inputs) ───

function presidentModuleInfo() {
  return {
    id: 'president',
    name: 'President',
    version: '1.0.0',
    players: { min: 3, max: 8 },
    end: { type: 'game_defined' },
    scoringType: {
      id: 'rank_order',
      version: '1.0.0',
      config: { pointsMap: { '1': 3, '2': 2, last: 0 } },
    },
    result: { type: 'ranking' },
    info: { summary: 'President summary', scoring: 'Finish positions' },
    maturity: 'released' as const,
  };
}

describe('Play: rank_order module — finish-order UI', () => {
  it('renders drag-to-reorder list instead of numeric inputs for rank_order module', async () => {
    const presidentGame = {
      id: 'game-president',
      moduleKey: 'president',
      status: 'ACTIVE',
      startedAt: '2026-06-25T10:00:00Z',
      endedAt: null,
      version: 1,
      participations: [
        baseParticipation('part-p1', 0, 'player-p1', 'alice'),
        baseParticipation('part-p2', 1, 'player-p2', 'bob'),
        baseParticipation('part-p3', 2, 'player-p3', 'carol'),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [presidentModuleInfo()] };
      }
      if (url === '/api/games/game-president') {
        return { ok: true, status: 200, json: async () => presidentGame };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-president']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load — should show finish order UI (the card heading)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Set Finish Order/i })).toBeInTheDocument();
    });

    // Should show "Drag to set finish order" instruction
    expect(screen.getByText(/Drag to set finish order — 1st place at top/i)).toBeInTheDocument();

    // Should show all 3 players in the list
    expect(screen.getAllByText('alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('bob').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('carol').length).toBeGreaterThanOrEqual(1);

    // Should show "Submit Finish Order" button (not "Save Round")
    expect(screen.getByRole('button', { name: /Submit Finish Order/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Round/i })).not.toBeInTheDocument();

    // Should NOT show numeric score inputs
    expect(screen.queryByPlaceholderText('Score')).not.toBeInTheDocument();

    // Should NOT show "Ended round" toggle
    expect(screen.queryByText(/ended round/i)).not.toBeInTheDocument();

    // Should NOT show "Running Totals" table (rank_order has no numeric running totals)
    expect(screen.queryByText(/Running Totals/i)).not.toBeInTheDocument();

    // "Finish Game" manual button should not appear for rank_order (auto-finishes after submit)
    expect(screen.queryByRole('button', { name: /^Finish Game$/i })).not.toBeInTheDocument();
  });
});

// ─── Test 9: rank_order results page shows rank-only (no Score column) ────────

describe('Play: rank_order results — ranking without score column', () => {
  it('shows rank-only results with no Score column when result type is ranking', async () => {
    const finishResult = {
      game: { id: 'game-president-done', status: 'COMPLETE' },
      resolved: {
        ranks: [
          { participationId: 'part-p1', rank: 1, didWin: true, score: null },
          { participationId: 'part-p2', rank: 2, didWin: false, score: null },
          { participationId: 'part-p3', rank: 3, didWin: false, score: null },
        ],
      },
    };

    const gameDetail = {
      id: 'game-president-done',
      moduleKey: 'president',
      status: 'COMPLETE',
      startedAt: '2026-06-25T10:00:00Z',
      version: 2,
      participations: [
        {
          id: 'part-p1',
          seat: 0,
          player: { id: 'p1', nickname: 'alice', userId: null },
          scoreState: {
            payload: {
              finishOrder: [
                { participationId: 'part-p1', rank: 1 },
                { participationId: 'part-p2', rank: 2 },
                { participationId: 'part-p3', rank: 3 },
              ],
            },
          },
        },
        {
          id: 'part-p2',
          seat: 1,
          player: { id: 'p2', nickname: 'bob', userId: null },
          scoreState: null,
        },
        {
          id: 'part-p3',
          seat: 2,
          player: { id: 'p3', nickname: 'carol', userId: null },
          scoreState: null,
        },
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [presidentModuleInfo()] };
      }
      if (url === '/api/games/game-president-done') {
        return { ok: true, status: 200, json: async () => gameDetail };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/play/game-president-done/results',
            state: { result: finishResult },
          },
        ]}
      >
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id/results" element={<ResultsPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Winner name in heading
    await waitFor(() => {
      expect(screen.getByText(/alice wins!/i)).toBeInTheDocument();
    });

    // "Ranked by finish order" subtitle
    await waitFor(() => {
      expect(screen.getByText(/Ranked by finish order/i)).toBeInTheDocument();
    });

    // Rankings should show rank positions
    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    // Player names visible in the results table
    expect(screen.getAllByText('alice').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('carol')).toBeInTheDocument();

    // No "Score" column header (rank-only result)
    expect(screen.queryByText(/^Score$/i)).not.toBeInTheDocument();
  });
});

// ─── Test 9b: winner_pick module renders single-winner picker (not numeric inputs) ─

function cahModuleInfo() {
  return {
    id: 'cards-against-humanity',
    name: 'Cards Against Humanity',
    version: '1.0.0',
    players: { min: 3, max: 20 },
    end: { type: 'target', target: 7 },
    scoringType: {
      id: 'winner_pick',
      version: '1.0.0',
      config: { direction: 'high', aggregate: 'sum' },
    },
    result: { type: 'numeric_total' },
    info: { summary: 'CAH summary', scoring: 'First to 7 Awesome Points wins.' },
    maturity: 'released' as const,
  };
}

describe('Play: winner_pick module — single-winner picker UI', () => {
  it('renders WinnerPickForm instead of numeric inputs for winner_pick module', async () => {
    const cahGame = {
      id: 'game-cah',
      moduleKey: 'cards-against-humanity',
      status: 'ACTIVE',
      startedAt: '2026-06-26T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        baseParticipation('part-c1', 0, 'player-c1', 'alice'),
        baseParticipation('part-c2', 1, 'player-c2', 'bob'),
        baseParticipation('part-c3', 2, 'player-c3', 'carol'),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [cahModuleInfo()] };
      }
      if (url === '/api/games/game-cah') {
        return { ok: true, status: 200, json: async () => cahGame };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-cah']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load — WinnerPickForm heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Pick Round Winner/i })).toBeInTheDocument();
    });

    // Should show player buttons (tap to select)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Select alice as round winner/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Select bob as round winner/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Select carol as round winner/i }),
      ).toBeInTheDocument();
    });

    // Should NOT show numeric score inputs (no <input type="number">)
    expect(screen.queryByPlaceholderText('Score')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

    // Should NOT show "Ended round" toggle
    expect(screen.queryByText(/ended round/i)).not.toBeInTheDocument();

    // Should NOT show "Set Finish Order" heading
    expect(screen.queryByRole('heading', { name: /Set Finish Order/i })).not.toBeInTheDocument();

    // "Award Point" button should be disabled initially (no selection)
    const awardBtn = screen.getByRole('button', { name: /Award Point/i });
    expect(awardBtn).toBeDisabled();

    // Click alice — button becomes enabled
    await userEvent.click(screen.getByRole('button', { name: /Select alice as round winner/i }));
    expect(awardBtn).not.toBeDisabled();

    // Alice button should show aria-pressed=true
    expect(screen.getByRole('button', { name: /Select alice as round winner/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Bob should remain unselected
    expect(screen.getByRole('button', { name: /Select bob as round winner/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('submits winner_pick event with correct payload when Award Point is clicked', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'test-uuid-cah-0000-0000-000000000000' as ReturnType<typeof crypto.randomUUID>,
    );

    const cahGame = {
      id: 'game-cah-submit',
      moduleKey: 'cards-against-humanity',
      status: 'ACTIVE',
      startedAt: '2026-06-26T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        baseParticipation('part-c1', 0, 'player-c1', 'alice'),
        baseParticipation('part-c2', 1, 'player-c2', 'bob'),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [cahModuleInfo()] };
      }
      if (url === '/api/games/game-cah-submit') {
        return { ok: true, status: 200, json: async () => cahGame };
      }
      if (url === '/api/games/game-cah-submit/events' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 2,
            scoreStates: [
              {
                participationId: 'part-c1',
                payload: {
                  winnerPickRounds: [{ round: 1, winnerId: 'part-c1' }],
                  totals: { 'part-c1': 1, 'part-c2': 0 },
                },
              },
              {
                participationId: 'part-c2',
                payload: {
                  winnerPickRounds: [{ round: 1, winnerId: 'part-c1' }],
                  totals: { 'part-c1': 1, 'part-c2': 0 },
                },
              },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-cah-submit']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Pick Round Winner/i })).toBeInTheDocument();
    });

    // Select alice
    await userEvent.click(screen.getByRole('button', { name: /Select alice as round winner/i }));

    // Click Award Point
    await userEvent.click(screen.getByRole('button', { name: /Award Point/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const eventCall = calls.find(
        ([u, o]) => u === '/api/games/game-cah-submit/events' && o?.method === 'POST',
      );
      expect(eventCall).toBeTruthy();
      const body = JSON.parse(eventCall![1].body as string);
      expect(body.type).toBe('winner_pick');
      expect(body.payload.round).toBe(1);
      expect(body.payload.winnerId).toBe('part-c1'); // alice's participation ID
    });
  });
});

// ─── Test 11: Cancel game — creator sees button, confirm navigates to dashboard ─

describe('Play: cancel game', () => {
  it('creator sees Cancel game button; confirm calls cancel API', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-cancel') {
        return { ok: true, status: 200, json: async () => baseActiveGame('game-cancel', 1) };
      }
      if (url === '/api/games/game-cancel/cancel' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'game-cancel',
            status: 'ABANDONED',
            endedAt: new Date().toISOString(),
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-cancel']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
              <Route path="/" element={<div data-testid="dashboard">dashboard</div>} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Creator sees "Cancel game" button
    const cancelBtns = screen.getAllByRole('button', { name: /Cancel game/i });
    expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
    const cancelBtn = cancelBtns[0];

    // Click it — confirmation modal appears
    await userEvent.click(cancelBtn);
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();

    // Confirm cancel — click the button inside the modal
    const modalCancelBtn = await screen.findAllByRole('button', { name: /Cancel game/i });
    await userEvent.click(modalCancelBtn[modalCancelBtn.length - 1]);

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const cancelCall = calls.find(
        ([u, o]) => u === '/api/games/game-cancel/cancel' && o?.method === 'POST',
      );
      expect(cancelCall).toBeTruthy();
    });
  });
});

// ─── Test 12: Delete game — creator sees button, confirm calls delete API ────

describe('Play: delete game from GamePage', () => {
  it('creator sees Delete button; confirm calls delete API', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      }
      if (url === '/api/games/game-del') {
        return { ok: true, status: 200, json: async () => baseActiveGame('game-del', 1) };
      }
      if (url === '/api/games/game-del' && opts?.method === 'DELETE') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ deleted: true }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-del']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
              <Route path="/" element={<div data-testid="dashboard">dashboard</div>} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Creator sees "Delete" button
    const deleteBtn = screen.getAllByRole('button', { name: /^Delete$/i })[0];
    expect(deleteBtn).toBeInTheDocument();

    // Click it — confirmation modal appears
    await userEvent.click(deleteBtn);
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();

    // Confirm delete
    await userEvent.click(screen.getByRole('button', { name: /Delete game/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const deleteCall = calls.find(
        ([u, o]) => u === '/api/games/game-del' && o?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
    });
  });
});

// ─── Test 13: Undo last round control ────────────────────────────────────────

describe('Play: undo last round', () => {
  it('shows undo button for creator when rounds have been saved (currentRound > 1)', async () => {
    // Game with 1 round already saved → currentRound will be 2
    const gameWithRound = {
      id: 'game-undo',
      moduleKey: 'skyjo',
      status: 'ACTIVE',
      startedAt: '2026-06-26T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1', // matches baseUser().id so isCreator = true
      participations: [
        participationWithScore(
          'part-u1',
          0,
          'player-u1',
          'alice',
          [{ round: 1, scores: { 'part-u1': 10, 'part-u2': 5 } }],
          { 'part-u1': 10, 'part-u2': 5 },
        ),
        participationWithScore(
          'part-u2',
          1,
          'player-u2',
          'bob',
          [{ round: 1, scores: { 'part-u1': 10, 'part-u2': 5 } }],
          { 'part-u1': 10, 'part-u2': 5 },
        ),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-undo')
        return { ok: true, status: 200, json: async () => gameWithRound };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-undo']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Wait for game to load
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // "Undo last round" button should be visible (creator + round > 1)
    const undoBtn = screen.getByRole('button', { name: /Undo last round/i });
    expect(undoBtn).toBeInTheDocument();
    expect(undoBtn).not.toBeDisabled();
  });

  it('does not show undo button when no rounds saved yet (currentRound === 1)', async () => {
    // Game with no rounds saved → currentRound = 1
    const freshGame = {
      ...baseActiveGame('game-undo-fresh', 0),
      createdById: 'user-1',
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-undo-fresh')
        return { ok: true, status: 200, json: async () => freshGame };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-undo-fresh']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Undo button should NOT appear (no rounds yet)
    expect(screen.queryByRole('button', { name: /Undo last round/i })).not.toBeInTheDocument();
  });

  it('clicking undo button shows confirm dialog and calls undo endpoint on confirm', async () => {
    const gameWithRound = {
      id: 'game-undo-confirm',
      moduleKey: 'skyjo',
      status: 'ACTIVE',
      startedAt: '2026-06-26T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        participationWithScore(
          'part-u1',
          0,
          'player-u1',
          'alice',
          [{ round: 1, scores: { 'part-u1': 10, 'part-u2': 5 } }],
          { 'part-u1': 10, 'part-u2': 5 },
        ),
        participationWithScore(
          'part-u2',
          1,
          'player-u2',
          'bob',
          [{ round: 1, scores: { 'part-u1': 10, 'part-u2': 5 } }],
          { 'part-u1': 10, 'part-u2': 5 },
        ),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-undo-confirm')
        return { ok: true, status: 200, json: async () => gameWithRound };
      if (url === '/api/games/game-undo-confirm/undo-last-round' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            undone: true,
            version: 0,
            scoreStates: [
              {
                participationId: 'part-u1',
                payload: { rounds: [], totals: { 'part-u1': 0, 'part-u2': 0 } },
              },
              {
                participationId: 'part-u2',
                payload: { rounds: [], totals: { 'part-u1': 0, 'part-u2': 0 } },
              },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-undo-confirm']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Click undo button
    await userEvent.click(screen.getByRole('button', { name: /Undo last round/i }));

    // Confirm dialog should appear
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/Undo last round/i);

    // Click confirm
    await userEvent.click(screen.getByRole('button', { name: /Undo round/i }));

    // Should have called the undo endpoint
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const undoCall = calls.find(
        ([u, o]) => u === '/api/games/game-undo-confirm/undo-last-round' && o?.method === 'POST',
      );
      expect(undoCall).toBeTruthy();
    });
  });
});

// ─── Test 14: Skyjo negative score entry ─────────────────────────────────────

describe('Play: Skyjo negative round score', () => {
  it('Save Round is enabled when score is a valid negative number (-2)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-neg')
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...baseActiveGame('game-neg', 0), createdById: 'user-1' }),
        };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-neg']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    const inputs = screen.getAllByPlaceholderText('Score');

    // Fill in -2 for alice and 5 for bob
    await userEvent.clear(inputs[0]);
    await userEvent.type(inputs[0], '-2');
    await userEvent.clear(inputs[1]);
    await userEvent.type(inputs[1], '5');

    // Save Round should be enabled
    const saveBtn = screen.getByRole('button', { name: 'Save Round' });
    expect(saveBtn).not.toBeDisabled();
  });

  it('Save Round is enabled when alice has a blank number input (browser stores "" for "-") and bob has 5', async () => {
    // With blank→0, a blank number input (which the browser produces when only "-" is typed)
    // is treated as valid (saves as 0), so the button remains enabled.
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-neg2')
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...baseActiveGame('game-neg2', 0), createdById: 'user-1' }),
        };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-neg2']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    const inputs = screen.getAllByPlaceholderText('Score');

    // Typing "-" in a number input results in "" (blank) — the browser discards invalid partial values.
    // With blank→0, "" is treated as valid (saves 0) so the button is enabled.
    await userEvent.clear(inputs[0]);
    await userEvent.type(inputs[0], '-');
    await userEvent.clear(inputs[1]);
    await userEvent.type(inputs[1], '5');

    // Save Round is enabled — blank (from "-" typed) coerces to 0
    const saveBtn = screen.getByRole('button', { name: 'Save Round' });
    expect(saveBtn).not.toBeDisabled();
  });
});

// ─── Test 15: Module maturity — picker filter and pre-release marker ─────────

function cribbagePreReleaseModuleInfo() {
  return {
    id: 'cribbage',
    name: 'Cribbage',
    version: '1.0.0',
    players: { min: 2, max: 3 },
    end: { type: 'target', target: 121, finishRound: false },
    fields: [{ name: 'roundScore', type: 'integer', label: 'Points this hand', required: true }],
    scoringType: {
      id: 'numeric_rounds',
      version: '1.0.0',
      config: { direction: 'high', aggregate: 'sum' },
    },
    result: { type: 'numeric_total' },
    maturity: 'pre_release' as const,
  };
}

function renderStartGamePage(modulesPayload: unknown[]) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
    if (url === '/api/players')
      return { ok: true, status: 200, json: async () => [basePlayer('p-1', 'alice')] };
    if (url === '/api/playgroups') return { ok: true, status: 200, json: async () => [] };
    if (url === '/api/modules') return { ok: true, status: 200, json: async () => modulesPayload };
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <MemoryRouter initialEntries={['/play/new']}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/play/new" element={<StartGamePage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Play: start-game — pre-release picker filter', () => {
  beforeEach(() => {
    // Clear localStorage toggle before each test so default state is clean
    localStorage.removeItem('gl-show-pre-release');
  });

  it('default picker shows only released games; pre-release games excluded', async () => {
    renderStartGamePage([cribbagePreReleaseModuleInfo(), unoModuleInfo()]);

    // Wait for data load; toggle is off by default
    await waitFor(() => {
      // Uno is released → appears; placeholder = 1 + uno = 2 options
      const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
      expect(gameSelect.options.length).toBe(2);
    });

    const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
    const optionTexts = Array.from(gameSelect.options).map((o) => o.text);
    expect(optionTexts.some((t) => t.includes('Uno'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('Cribbage'))).toBe(false);
  });

  it('empty-state hint appears when no released games and toggle is off', async () => {
    // Only a pre-release game — default list will be empty
    renderStartGamePage([cribbagePreReleaseModuleInfo()]);

    await waitFor(() => {
      expect(screen.getByText(/No released games yet/i)).toBeInTheDocument();
    });
    // The hint mentions the toggle label and the checkbox label both appear
    expect(screen.getAllByText(/Show pre-release games/i).length).toBeGreaterThanOrEqual(1);
  });

  it('enabling "Show pre-release games" reveals pre-release game with · Pre-release marker', async () => {
    renderStartGamePage([cribbagePreReleaseModuleInfo(), unoModuleInfo()]);

    // Wait for initial load
    await waitFor(() => {
      const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
      expect(gameSelect.options.length).toBe(2); // placeholder + uno
    });

    // Turn on the toggle
    await userEvent.click(screen.getByRole('checkbox', { name: /Show pre-release games/i }));

    // Now cribbage should appear with · Pre-release marker
    await waitFor(() => {
      const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
      expect(gameSelect.options.length).toBe(3); // placeholder + uno + cribbage
    });

    const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
    const optionTexts = Array.from(gameSelect.options).map((o) => o.text);
    const cribbageOption = optionTexts.find((t) => t.includes('Cribbage'));
    expect(cribbageOption).toBeDefined();
    expect(cribbageOption).toMatch(/· Pre-release/);

    // Released game should NOT have the marker
    const unoOption = optionTexts.find((t) => t.includes('Uno'));
    expect(unoOption).toBeDefined();
    expect(unoOption).not.toMatch(/Pre-release/);
  });

  it('released game does NOT have the · Pre-release marker', async () => {
    renderStartGamePage([unoModuleInfo()]);

    await waitFor(() => {
      const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
      expect(gameSelect.options.length).toBe(2); // placeholder + uno
    });

    const gameSelect = screen.getByLabelText('Game') as HTMLSelectElement;
    const unoOption = Array.from(gameSelect.options).find((o) => o.text.includes('Uno'));
    expect(unoOption).toBeDefined();
    expect(unoOption!.text).not.toMatch(/Pre-release/);
  });
});

// ─── Test 16: getDealerIndex — dealer rotation ────────────────────────────────

describe('Cribbage: getDealerIndex — dealer rotation', () => {
  it('hand 1 → seat 0 for any player count', () => {
    expect(getDealerIndex(1, 2)).toBe(0);
    expect(getDealerIndex(1, 3)).toBe(0);
  });

  it('hand 2 → seat 1', () => {
    expect(getDealerIndex(2, 2)).toBe(1);
    expect(getDealerIndex(2, 3)).toBe(1);
  });

  it('hand 3 → seat 2 for 3 players, seat 0 for 2 players (wrap)', () => {
    expect(getDealerIndex(3, 3)).toBe(2);
    expect(getDealerIndex(3, 2)).toBe(0);
  });

  it('hand 4 → seat 0 for 3 players (full rotation wrap)', () => {
    expect(getDealerIndex(4, 3)).toBe(0);
    expect(getDealerIndex(4, 2)).toBe(1);
  });

  it('crib owner = dealer (same index)', () => {
    // The dealer IS the crib owner — no separate derivation needed.
    const dealerIdx = getDealerIndex(2, 3);
    expect(dealerIdx).toBe(1); // seat 1 = crib owner for hand 2 of a 3-player game
  });

  it('returns 0 safely when playerCount is 0', () => {
    expect(getDealerIndex(1, 0)).toBe(0);
  });
});

// ─── Test 17: CribbageCapture — live-pegging quick buttons and undo ──────────

describe('Cribbage: CribbageCapture — live-pegging buttons', () => {
  function makeProps(overrides: Partial<Parameters<typeof CribbageCapture>[0]> = {}) {
    return {
      participations: [
        {
          id: 'cp-1',
          seat: 0,
          player: { id: 'player-cp1', nickname: 'alice', userId: null },
          scoreState: null,
        },
        {
          id: 'cp-2',
          seat: 1,
          player: { id: 'player-cp2', nickname: 'bob', userId: null },
          scoreState: null,
        },
      ],
      currentDeal: 1,
      saving: false,
      target: 121,
      addScore: vi.fn().mockResolvedValue(undefined),
      endDeal: vi.fn().mockResolvedValue(undefined),
      onUndoLast: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('+1 button calls addScore(id, 1) immediately', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CribbageCapture {...makeProps({ addScore })} />);
    await user.click(screen.getByRole('button', { name: '+1 for alice' }));
    expect(addScore).toHaveBeenCalledWith('cp-1', 1);
  });

  it('+2 button calls addScore(id, 2)', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CribbageCapture {...makeProps({ addScore })} />);
    await user.click(screen.getByRole('button', { name: '+2 for bob' }));
    expect(addScore).toHaveBeenCalledWith('cp-2', 2);
  });

  it('add field calls addScore with typed value and clears the input', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CribbageCapture {...makeProps({ addScore })} />);
    const addInput = screen.getByLabelText('Add points for alice');
    await user.type(addInput, '12');
    await user.click(screen.getByRole('button', { name: 'Add custom points for alice' }));
    expect(addScore).toHaveBeenCalledWith('cp-1', 12);
    expect((addInput as HTMLInputElement).value).toBe('');
  });

  it('global undo button calls onUndoLast()', async () => {
    const onUndoLast = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CribbageCapture {...makeProps({ onUndoLast })} />);
    await user.click(screen.getByRole('button', { name: 'Undo last peg' }));
    expect(onUndoLast).toHaveBeenCalledOnce();
  });

  it('End Deal button calls endDeal()', async () => {
    const endDeal = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CribbageCapture {...makeProps({ endDeal })} />);
    await user.click(screen.getByTestId('end-deal-btn'));
    expect(endDeal).toHaveBeenCalledOnce();
  });

  it('all scoring buttons disabled while saving=true', () => {
    render(<CribbageCapture {...makeProps({ saving: true })} />);
    expect(screen.getByRole('button', { name: '+1 for alice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+2 for alice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+3 for alice' })).toBeDisabled();
    expect(screen.getByTestId('end-deal-btn')).toBeDisabled();
    // Undo remains enabled while saving (so mis-tap can still be corrected after op settles)
    expect(screen.getByRole('button', { name: 'Undo last peg' })).toBeDisabled();
  });
});

// ─── Test 18: CribbageCapture — dealer chip and crib label ───────────────────

describe('Cribbage: CribbageCapture — dealer chip / crib label (live model)', () => {
  const participations = [
    {
      id: 'sh-1',
      seat: 0,
      player: { id: 'player-sh1', nickname: 'alice', userId: null },
      scoreState: null,
    },
    {
      id: 'sh-2',
      seat: 1,
      player: { id: 'player-sh2', nickname: 'bob', userId: null },
      scoreState: null,
    },
  ];
  const defaultProps = {
    participations,
    saving: false,
    target: 121,
    addScore: vi.fn().mockResolvedValue(undefined),
    endDeal: vi.fn().mockResolvedValue(undefined),
    onUndoLast: vi.fn().mockResolvedValue(undefined),
  };

  it('dealer chip on alice (seat 0) and crib label says "Deal 1" for deal 1', () => {
    render(<CribbageCapture {...defaultProps} currentDeal={1} />);
    expect(screen.getByTestId('dealer-chip-sh-1')).toBeInTheDocument();
    expect(screen.queryByTestId('dealer-chip-sh-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('crib-label')).toHaveTextContent("alice's crib — Deal 1");
  });

  it('dealer chip moves to bob (seat 1) for deal 2', () => {
    render(<CribbageCapture {...defaultProps} currentDeal={2} />);
    expect(screen.queryByTestId('dealer-chip-sh-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('dealer-chip-sh-2')).toBeInTheDocument();
    expect(screen.getByTestId('crib-label')).toHaveTextContent("bob's crib — Deal 2");
  });

  it('End Deal button is present and Save Hand is not', () => {
    render(<CribbageCapture {...defaultProps} currentDeal={1} />);
    expect(screen.getByTestId('end-deal-btn')).toHaveTextContent('End Deal');
    expect(screen.queryByRole('button', { name: /Save Hand/i })).not.toBeInTheDocument();
  });
});

// ─── Test 19: Capture registry ────────────────────────────────────────────────

describe('Cribbage: capture registry', () => {
  it('getCaptureComponent returns a component for cribbage', () => {
    const comp = getCaptureComponent('cribbage');
    expect(comp).not.toBeNull();
    expect(typeof comp).toBe('function');
  });

  it('getCaptureComponent returns null for skyjo', () => {
    expect(getCaptureComponent('skyjo')).toBeNull();
  });

  it('getCaptureComponent returns null for unknown module ids', () => {
    expect(getCaptureComponent('uno')).toBeNull();
    expect(getCaptureComponent('president')).toBeNull();
    expect(getCaptureComponent('')).toBeNull();
  });
});

// ─── Test 20: GamePage — cribbage uses CribbageCapture; others use ScoreForm ──

describe('Cribbage: GamePage — capture routing', () => {
  it('cribbage game renders CribbageCapture (End Deal button, dealer chip, no Save Hand)', async () => {
    const cribbageGame = {
      id: 'game-crib',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-28T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        baseParticipation('cpart-1', 0, 'cp1', 'alice'),
        baseParticipation('cpart-2', 1, 'cp2', 'bob'),
      ],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [cribbagePreReleaseModuleInfo()] };
      if (url === '/api/games/game-crib')
        return { ok: true, status: 200, json: async () => cribbageGame };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-crib']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Should show End Deal (live CribbageCapture), not Save Round (ScoreForm)
    await waitFor(() => {
      expect(screen.getByTestId('end-deal-btn')).toBeInTheDocument();
    });

    // No "Save Hand" in live model
    expect(screen.queryByRole('button', { name: /Save Hand/i })).not.toBeInTheDocument();

    // Generic ScoreForm inputs should NOT appear
    expect(screen.queryByPlaceholderText('Score')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Round' })).not.toBeInTheDocument();

    // Dealer chip for deal 1 → alice (cpart-1, seat 0)
    await waitFor(() => {
      expect(screen.getByTestId('dealer-chip-cpart-1')).toBeInTheDocument();
    });
  });

  it('non-cribbage numeric game (skyjo) still renders generic ScoreForm', async () => {
    const skyjoGame = {
      ...baseActiveGame('game-skyjo-routing', 1),
      moduleKey: 'skyjo',
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-skyjo-routing')
        return { ok: true, status: 200, json: async () => skyjoGame };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-skyjo-routing']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    // Should show Score inputs and Save Round (generic ScoreForm)
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    expect(screen.getByRole('button', { name: 'Save Round' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Hand/i })).not.toBeInTheDocument();
  });
});

// ─── Test 21: ScoreForm — blank input coerced to 0 on Save ───────────────────

describe('Play: ScoreForm — blank input → 0', () => {
  it('Save Round is enabled with blank inputs (blank coerced to 0)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-blank0')
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...baseActiveGame('game-blank0', 0), createdById: 'user-1' }),
        };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-blank0']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Both inputs blank → button should now be enabled (blank = 0)
    const saveBtn = screen.getByRole('button', { name: 'Save Round' });
    expect(saveBtn).not.toBeDisabled();
  });

  it('submits 0 for a blank input when Save Round is clicked', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'test-uuid-blank-0000-0000-000000000000' as ReturnType<typeof crypto.randomUUID>,
    );

    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => baseUser() };
      if (url === '/api/modules')
        return { ok: true, status: 200, json: async () => [skyjoModuleInfo()] };
      if (url === '/api/games/game-blank-submit')
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...baseActiveGame('game-blank-submit', 0), createdById: 'user-1' }),
        };
      if (url === '/api/games/game-blank-submit/events' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 1,
            scoreStates: [
              {
                participationId: 'part-1',
                payload: {
                  rounds: [{ round: 1, scores: { 'part-1': 0, 'part-2': 0 } }],
                  totals: { 'part-1': 0, 'part-2': 0 },
                },
              },
              {
                participationId: 'part-2',
                payload: {
                  rounds: [{ round: 1, scores: { 'part-1': 0, 'part-2': 0 } }],
                  totals: { 'part-1': 0, 'part-2': 0 },
                },
              },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-blank-submit']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/play/:id" element={<GamePage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Leave both inputs blank and click Save Round
    await userEvent.click(screen.getByRole('button', { name: 'Save Round' }));

    // Verify the posted scores are 0 for both players
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const eventCall = calls.find(
        ([u, o]) => u === '/api/games/game-blank-submit/events' && o?.method === 'POST',
      );
      expect(eventCall).toBeTruthy();
      const body = JSON.parse(eventCall![1].body as string);
      expect(body.type).toBe('round_score');
      // Both scores should be 0 (blank coerced to 0)
      const scores = body.payload.scores as Array<{ participationId: string; roundScore: number }>;
      expect(scores.every((s) => s.roundScore === 0)).toBe(true);
    });
  });
});
