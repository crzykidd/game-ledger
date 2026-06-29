import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/ui/Toast';
import { CribbageBoard } from './presentation/CribbageBoard';
import { getBoardComponent } from './presentation';
import { GamePage } from './GamePage';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeParticipation(
  id: string,
  seat: number,
  nickname: string,
  rounds: Array<{ round: number; scores: Record<string, number> }>,
  totals: Record<string, number>,
) {
  return {
    id,
    seat,
    player: { id: `player-${id}`, nickname, userId: null },
    scoreState: {
      payload: { rounds, totals },
    },
  };
}

function emptyParticipation(id: string, seat: number, nickname: string) {
  return {
    id,
    seat,
    player: { id: `player-${id}`, nickname, userId: null },
    scoreState: null,
  };
}

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

function cribbageModuleInfo() {
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
    info: { summary: 'Cribbage summary', scoring: 'Cribbage scoring ref' },
  };
}

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
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Test 1: Registry ──────────────────────────────────────────────────────────

describe('CribbageBoard: presentation registry', () => {
  it('getBoardComponent("cribbage") returns a component', () => {
    const Comp = getBoardComponent('cribbage');
    expect(Comp).not.toBeNull();
    expect(typeof Comp).toBe('function');
  });

  it('getBoardComponent("skyjo") returns null', () => {
    expect(getBoardComponent('skyjo')).toBeNull();
  });

  it('getBoardComponent("unknown") returns null', () => {
    expect(getBoardComponent('unknown')).toBeNull();
  });
});

// ─── Test 2: Renders one track per player (2 players) ─────────────────────────

describe('CribbageBoard: renders tracks', () => {
  it('renders two player tracks for a 2-player game', () => {
    const participations = [
      emptyParticipation('part-1', 0, 'alice'),
      emptyParticipation('part-2', 1, 'bob'),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    expect(screen.getByTestId('player-track-part-1')).toBeInTheDocument();
    expect(screen.getByTestId('player-track-part-2')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('renders three player tracks for a 3-player game', () => {
    const participations = [
      emptyParticipation('part-1', 0, 'alice'),
      emptyParticipation('part-2', 1, 'bob'),
      emptyParticipation('part-3', 2, 'carol'),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    expect(screen.getByTestId('player-track-part-1')).toBeInTheDocument();
    expect(screen.getByTestId('player-track-part-2')).toBeInTheDocument();
    expect(screen.getByTestId('player-track-part-3')).toBeInTheDocument();
    expect(screen.getByText('carol')).toBeInTheDocument();
  });
});

// ─── Test 3: Peg positions from totals + last-hand delta ─────────────────────

describe('CribbageBoard: peg positions', () => {
  it('front peg at total=24, rear peg at 16 when last hand scored 8', () => {
    // total=24, lastDelta=8, rearScore=16
    const rounds = [
      { round: 1, scores: { 'part-1': 16, 'part-2': 12 } },
      { round: 2, scores: { 'part-1': 8, 'part-2': 5 } },
    ];
    const totals = { 'part-1': 24, 'part-2': 17 };
    const participations = [
      makeParticipation('part-1', 0, 'alice', rounds, totals),
      makeParticipation('part-2', 1, 'bob', rounds, totals),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    // Front peg for part-1: data-score=24
    const frontPeg1 = screen.getByTestId('front-peg-part-1');
    expect(frontPeg1).toBeInTheDocument();
    expect(frontPeg1).toHaveAttribute('data-score', '24');

    // Rear peg for part-1: data-score=16 (24 - 8)
    const rearPeg1 = screen.getByTestId('rear-peg-part-1');
    expect(rearPeg1).toBeInTheDocument();
    expect(rearPeg1).toHaveAttribute('data-score', '16');

    // Front peg for part-2: data-score=17
    const frontPeg2 = screen.getByTestId('front-peg-part-2');
    expect(frontPeg2).toHaveAttribute('data-score', '17');

    // Rear peg for part-2: data-score=12 (17 - 5)
    const rearPeg2 = screen.getByTestId('rear-peg-part-2');
    expect(rearPeg2).toHaveAttribute('data-score', '12');
  });

  it('no pegs shown when game has no rounds (fresh game)', () => {
    const participations = [
      emptyParticipation('part-1', 0, 'alice'),
      emptyParticipation('part-2', 1, 'bob'),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    // No pegs rendered when score is 0
    expect(screen.queryByTestId('front-peg-part-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rear-peg-part-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('front-peg-part-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rear-peg-part-2')).not.toBeInTheDocument();
  });

  it('rear peg uses each player\'s own last non-zero increment (interleaved pegs + empty deal marker)', () => {
    // Rounds:
    //   1: p1 pegs 5          p1 total: 5
    //   2: p2 pegs 3          p2 total: 3
    //   3: p1 pegs 2          p1 total: 7
    //   4: {} (End Deal)      no score change
    //   5: p2 pegs 4          p2 total: 7
    //
    // p1 last non-zero delta = 2 (round 3) → rear = 7 - 2 = 5
    // p2 last non-zero delta = 4 (round 5) → rear = 7 - 4 = 3
    //
    // Old (global last round) would give:
    //   p1: last round = { round 5, scores { p2: 4 } } → delta for p1 = 0 → rear = 7 (WRONG)
    //   p2: delta = 4 → rear = 3 (correct but coincidentally)
    const rounds: Array<{ round: number; scores: Record<string, number> }> = [
      { round: 1, scores: { 'part-1': 5 } },
      { round: 2, scores: { 'part-2': 3 } },
      { round: 3, scores: { 'part-1': 2 } },
      { round: 4, scores: {} },               // End Deal marker
      { round: 5, scores: { 'part-2': 4 } },
    ];
    const totals = { 'part-1': 7, 'part-2': 7 };
    const participations = [
      makeParticipation('part-1', 0, 'alice', rounds, totals),
      makeParticipation('part-2', 1, 'bob', rounds, totals),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    // p1 rear peg: 7 - 2 = 5 (own last non-zero was round 3 = +2)
    expect(screen.getByTestId('rear-peg-part-1')).toHaveAttribute('data-score', '5');
    // p2 rear peg: 7 - 4 = 3 (own last non-zero was round 5 = +4)
    expect(screen.getByTestId('rear-peg-part-2')).toHaveAttribute('data-score', '3');
  });

  it('rear peg absent when first hand only (no prior position)', () => {
    // Only one round played — rearScore = total - lastDelta = 0
    const rounds = [{ round: 1, scores: { 'part-1': 10, 'part-2': 7 } }];
    const totals = { 'part-1': 10, 'part-2': 7 };
    const participations = [
      makeParticipation('part-1', 0, 'alice', rounds, totals),
      makeParticipation('part-2', 1, 'bob', rounds, totals),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    // Front pegs should be present
    expect(screen.getByTestId('front-peg-part-1')).toHaveAttribute('data-score', '10');
    expect(screen.getByTestId('front-peg-part-2')).toHaveAttribute('data-score', '7');

    // Rear pegs should NOT be shown (rear score = 0)
    expect(screen.queryByTestId('rear-peg-part-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rear-peg-part-2')).not.toBeInTheDocument();
  });
});

// ─── Test 4: Skunk lines and finish line ──────────────────────────────────────

describe('CribbageBoard: skunk lines and finish', () => {
  it('renders skunk lines at 61 and 91 and finish line at 121', () => {
    const participations = [
      emptyParticipation('part-1', 0, 'alice'),
      emptyParticipation('part-2', 1, 'bob'),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    expect(screen.getByTestId('skunk-line-61')).toBeInTheDocument();
    expect(screen.getByTestId('skunk-line-91')).toBeInTheDocument();
    expect(screen.getByTestId('finish-line-121')).toBeInTheDocument();

    // Labels visible
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
    expect(screen.getByText('121')).toBeInTheDocument();
  });
});

// ─── Dark-mode legibility (regression) ────────────────────────────────────────

describe('CribbageBoard: dark-mode legibility', () => {
  it('non-winner score label uses theme-aware fill so it stays legible in dark mode', () => {
    const rounds = [{ round: 1, scores: { 'part-1': 24 } }];
    const totals = { 'part-1': 24 };
    const participations = [makeParticipation('part-1', 0, 'alice', rounds, totals)];

    render(<CribbageBoard participations={participations} target={121} />);

    // Regression guard: the score must not be a hardcoded near-black hex (invisible
    // on the dark card) — it should carry the dark: fill utility.
    const scoreLabel = screen.getByTestId('score-label-part-1');
    expect(scoreLabel.getAttribute('class')).toContain('dark:fill-slate-100');
    expect(scoreLabel.getAttribute('fill')).toBeNull();
  });
});

// ─── Test 5: Winner flagging ──────────────────────────────────────────────────

describe('CribbageBoard: winner flagging', () => {
  it('flags a player who has reached or exceeded target as winner', () => {
    const rounds = [
      { round: 1, scores: { 'part-1': 60, 'part-2': 30 } },
      { round: 2, scores: { 'part-1': 61, 'part-2': 20 } },
    ];
    const totals = { 'part-1': 121, 'part-2': 50 };
    const participations = [
      makeParticipation('part-1', 0, 'alice', rounds, totals),
      makeParticipation('part-2', 1, 'bob', rounds, totals),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    // alice (part-1) has hit 121 — should be flagged
    expect(screen.getByTestId('winner-flag-part-1')).toBeInTheDocument();

    // bob (part-2) has not — should not be flagged
    expect(screen.queryByTestId('winner-flag-part-2')).not.toBeInTheDocument();
  });

  it('no winner flag shown when no player has reached target', () => {
    const rounds = [{ round: 1, scores: { 'part-1': 20, 'part-2': 15 } }];
    const totals = { 'part-1': 20, 'part-2': 15 };
    const participations = [
      makeParticipation('part-1', 0, 'alice', rounds, totals),
      makeParticipation('part-2', 1, 'bob', rounds, totals),
    ];

    render(<CribbageBoard participations={participations} target={121} />);

    expect(screen.queryByTestId('winner-flag-part-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('winner-flag-part-2')).not.toBeInTheDocument();
  });
});

// ─── Test 6: GamePage integration ─────────────────────────────────────────────

function renderGamePage(gameData: object, modules: object[]) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url === '/api/auth/me') {
      return { ok: true, status: 200, json: async () => baseUser() };
    }
    if (url === '/api/modules') {
      return { ok: true, status: 200, json: async () => modules };
    }
    if (url.startsWith('/api/games/')) {
      return { ok: true, status: 200, json: async () => gameData };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <MemoryRouter initialEntries={['/play/game-test']}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/play/:id" element={<GamePage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('CribbageBoard: GamePage integration', () => {
  it('renders the cribbage board for a cribbage game', async () => {
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(cribbageGame, [cribbageModuleInfo()]);

    // Board should appear
    await waitFor(() => {
      expect(screen.getByTestId('cribbage-board')).toBeInTheDocument();
    });

    // Player tracks
    expect(screen.getByTestId('player-track-part-1')).toBeInTheDocument();
    expect(screen.getByTestId('player-track-part-2')).toBeInTheDocument();
  });

  it('renders CribbageCapture (End Deal + dealer chip) and does NOT show Running Totals for a cribbage game', async () => {
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(cribbageGame, [cribbageModuleInfo()]);

    // CribbageCapture replaces the generic ScoreForm — End Deal button appears
    await waitFor(() => {
      expect(screen.getByTestId('end-deal-btn')).toBeInTheDocument();
    });

    // No "Save Hand" button in live model
    expect(screen.queryByRole('button', { name: /Save Hand/i })).not.toBeInTheDocument();

    // Generic Score inputs should NOT appear for cribbage
    expect(screen.queryByPlaceholderText('Score')).not.toBeInTheDocument();

    // Dealer chip for deal 1 → alice (part-1, seat 0)
    expect(screen.getByTestId('dealer-chip-part-1')).toBeInTheDocument();

    // Running Totals table should NOT render for cribbage — the board shows scores
    expect(screen.queryByText('Running Totals')).not.toBeInTheDocument();
  });

  it('shows Deal N in header (not Round N) for a cribbage game', async () => {
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(cribbageGame, [cribbageModuleInfo()]);

    await waitFor(() => {
      expect(screen.getByTestId('end-deal-btn')).toBeInTheDocument();
    });

    // Header title should say "Cribbage — Deal 1", not "Round 1"
    expect(screen.getByText(/Cribbage — Deal 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Round \d+/)).not.toBeInTheDocument();
  });

  it('shows win banner (not capture panel) when a player has reached the target', async () => {
    const winnerGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 5,
      createdById: 'user-1',
      participations: [
        makeParticipation(
          'part-1', 0, 'alice',
          [{ round: 1, scores: { 'part-1': 121 } }],
          { 'part-1': 121, 'part-2': 40 },
        ),
        makeParticipation(
          'part-2', 1, 'bob',
          [{ round: 1, scores: { 'part-1': 121 } }],
          { 'part-1': 121, 'part-2': 40 },
        ),
      ],
    };

    renderGamePage(winnerGame, [cribbageModuleInfo()]);

    // Win banner should appear
    await waitFor(() => {
      expect(screen.getByTestId('win-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('win-banner-name')).toHaveTextContent('alice wins!');

    // Capture panel should NOT be shown (win banner replaces it)
    expect(screen.queryByTestId('end-deal-btn')).not.toBeInTheDocument();

    // Finish Game and Undo buttons in the banner
    expect(screen.getByTestId('win-banner-finish-btn')).toBeInTheDocument();
    expect(screen.getByTestId('win-banner-undo-btn')).toBeInTheDocument();
  });

  it('addScore posts round_score event with unique increasing round and single scorer', async () => {
    // Game with two existing rounds (pegs already posted)
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 3,
      createdById: 'user-1',
      participations: [
        makeParticipation(
          'part-1', 0, 'alice',
          [
            { round: 1, scores: { 'part-1': 3 } },
            { round: 2, scores: { 'part-2': 2 } },
          ],
          { 'part-1': 3, 'part-2': 2 },
        ),
        makeParticipation(
          'part-2', 1, 'bob',
          [
            { round: 1, scores: { 'part-1': 3 } },
            { round: 2, scores: { 'part-2': 2 } },
          ],
          { 'part-1': 3, 'part-2': 2 },
        ),
      ],
    };

    // Track all fetch calls
    const postCalls: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [cribbageModuleInfo()] };
      }
      if (url === '/api/games/game-test/events') {
        const body = JSON.parse((init?.body as string) ?? '{}');
        postCalls.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 4,
            scoreStates: [
              { participationId: 'part-1', payload: { rounds: [], totals: { 'part-1': 4, 'part-2': 2 } } },
              { participationId: 'part-2', payload: { rounds: [], totals: { 'part-1': 4, 'part-2': 2 } } },
            ],
          }),
        };
      }
      if (url.startsWith('/api/games/game-test')) {
        return { ok: true, status: 200, json: async () => cribbageGame };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-test']}>
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
      expect(screen.getByTestId('end-deal-btn')).toBeInTheDocument();
    });

    // Click +1 for alice (part-1)
    const { act } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-plus1-part-1'));
    });

    // Should have posted a round_score with round=3 (max=2, next=3) and one scorer
    expect(postCalls).toHaveLength(1);
    const posted = postCalls[0] as { type: string; payload: { round: number; scores: unknown[] } };
    expect(posted.type).toBe('round_score');
    expect(posted.payload.round).toBe(3); // next after max=2
    expect(posted.payload.scores).toEqual([{ participationId: 'part-1', roundScore: 1 }]);
  });

  it('endDeal posts round_score with empty scores array', async () => {
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 2,
      createdById: 'user-1',
      participations: [
        makeParticipation(
          'part-1', 0, 'alice',
          [{ round: 1, scores: { 'part-1': 5 } }],
          { 'part-1': 5, 'part-2': 0 },
        ),
        makeParticipation(
          'part-2', 1, 'bob',
          [{ round: 1, scores: { 'part-1': 5 } }],
          { 'part-1': 5, 'part-2': 0 },
        ),
      ],
    };

    const postCalls: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/modules') {
        return { ok: true, status: 200, json: async () => [cribbageModuleInfo()] };
      }
      if (url === '/api/games/game-test/events') {
        const body = JSON.parse((init?.body as string) ?? '{}');
        postCalls.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 3,
            scoreStates: [
              { participationId: 'part-1', payload: { rounds: [{ round: 1, scores: { 'part-1': 5 } }, { round: 2, scores: {} }], totals: { 'part-1': 5, 'part-2': 0 } } },
              { participationId: 'part-2', payload: { rounds: [{ round: 1, scores: { 'part-1': 5 } }, { round: 2, scores: {} }], totals: { 'part-1': 5, 'part-2': 0 } } },
            ],
          }),
        };
      }
      if (url.startsWith('/api/games/game-test')) {
        return { ok: true, status: 200, json: async () => cribbageGame };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/play/game-test']}>
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
      expect(screen.getByTestId('end-deal-btn')).toBeInTheDocument();
    });

    const { act } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.click(screen.getByTestId('end-deal-btn'));
    });

    // Should have posted round_score with empty scores (deal marker)
    expect(postCalls).toHaveLength(1);
    const posted = postCalls[0] as { type: string; payload: { round: number; scores: unknown[] } };
    expect(posted.type).toBe('round_score');
    expect(posted.payload.round).toBe(2); // next after round 1
    expect(posted.payload.scores).toEqual([]); // empty scores = End Deal marker
  });

  it('shows Running Totals for a numeric game without a board (e.g. skyjo)', async () => {
    const skyjoGame = {
      id: 'game-test',
      moduleKey: 'skyjo',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(skyjoGame, [skyjoModuleInfo()]);

    // Running Totals must appear for non-board numeric games
    await waitFor(() => {
      expect(screen.getByText('Running Totals')).toBeInTheDocument();
    });
  });

  it('does NOT render the cribbage board for a non-cribbage numeric game', async () => {
    const skyjoGame = {
      id: 'game-test',
      moduleKey: 'skyjo',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(skyjoGame, [skyjoModuleInfo()]);

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    // Board should NOT appear for skyjo
    expect(screen.queryByTestId('cribbage-board')).not.toBeInTheDocument();
  });

  it('strips @version suffix from moduleKey before board lookup (cribbage@1 → board shown)', async () => {
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage@1',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    // Module id is 'cribbage' (no version), but moduleKey is 'cribbage@1'
    renderGamePage(cribbageGame, [cribbageModuleInfo()]);

    await waitFor(() => {
      expect(screen.getByTestId('cribbage-board')).toBeInTheDocument();
    });
  });
});

// ─── Test 7: Module maturity — "Pre-release" badge ───────────────────────────

describe('GamePage: Pre-release badge', () => {
  it('shows "Pre-release" badge when module has maturity pre_release', async () => {
    const preReleaseModule = { ...cribbageModuleInfo(), maturity: 'pre_release' as const };
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(cribbageGame, [preReleaseModule]);

    await waitFor(() => {
      expect(screen.getByTestId('pre-release-badge')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pre-release-badge')).toHaveTextContent('Pre-release');
  });

  it('shows "Pre-release" badge when module has no maturity field (default = pre-release)', async () => {
    // cribbageModuleInfo() has no maturity field — missing = pre-release → badge shows
    const cribbageGame = {
      id: 'game-test',
      moduleKey: 'cribbage',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(cribbageGame, [cribbageModuleInfo()]);

    await waitFor(() => {
      expect(screen.getByTestId('pre-release-badge')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pre-release-badge')).toHaveTextContent('Pre-release');
  });

  it('does NOT show "Pre-release" badge when module has maturity released', async () => {
    const releasedModule = { ...skyjoModuleInfo(), maturity: 'released' as const };
    const skyjoGame = {
      id: 'game-test',
      moduleKey: 'skyjo',
      status: 'ACTIVE',
      startedAt: '2026-06-27T10:00:00Z',
      endedAt: null,
      version: 1,
      createdById: 'user-1',
      participations: [
        emptyParticipation('part-1', 0, 'alice'),
        emptyParticipation('part-2', 1, 'bob'),
      ],
    };

    renderGamePage(skyjoGame, [releasedModule]);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Score').length).toBe(2);
    });

    expect(screen.queryByTestId('pre-release-badge')).not.toBeInTheDocument();
  });
});
