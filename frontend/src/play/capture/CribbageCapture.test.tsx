import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CribbageCapture, getDealerIndex } from './CribbageCapture';

function makeParticipations(ids: string[], totals?: Record<string, number>) {
  return ids.map((id, i) => ({
    id,
    seat: i,
    player: { id: `player-${id}`, nickname: `Player${i + 1}`, userId: null },
    scoreState: totals
      ? { payload: { rounds: [], totals } }
      : null,
  }));
}

function defaultProps(overrides: Partial<Parameters<typeof CribbageCapture>[0]> = {}) {
  return {
    participations: makeParticipations(['p1', 'p2']),
    currentDeal: 1,
    saving: false,
    target: 121,
    addScore: vi.fn().mockResolvedValue(undefined),
    endDeal: vi.fn().mockResolvedValue(undefined),
    onUndoLast: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── getDealerIndex ──────────────────────────────────────────────────────────────

describe('getDealerIndex', () => {
  it('deal 1 → seat 0 for 3 players', () => {
    expect(getDealerIndex(1, 3)).toBe(0);
  });
  it('deal 2 → seat 1 for 3 players', () => {
    expect(getDealerIndex(2, 3)).toBe(1);
  });
  it('deal 3 → seat 2 for 3 players', () => {
    expect(getDealerIndex(3, 3)).toBe(2);
  });
  it('deal 4 → seat 0 again (wraps around) for 3 players', () => {
    expect(getDealerIndex(4, 3)).toBe(0);
  });
  it('deal 1 → seat 0 for 2 players', () => {
    expect(getDealerIndex(1, 2)).toBe(0);
  });
  it('deal 2 → seat 1 for 2 players', () => {
    expect(getDealerIndex(2, 2)).toBe(1);
  });
  it('deal 3 → seat 0 again for 2 players', () => {
    expect(getDealerIndex(3, 2)).toBe(0);
  });
  it('returns 0 when playerCount is 0', () => {
    expect(getDealerIndex(1, 0)).toBe(0);
  });
});

// ─── Crib label ──────────────────────────────────────────────────────────────────

describe('CribbageCapture: crib label', () => {
  it('shows dealer name and deal number in crib label', () => {
    render(<CribbageCapture {...defaultProps({ currentDeal: 1 })} />);
    expect(screen.getByTestId('crib-label')).toHaveTextContent("Player1's crib — Deal 1");
  });

  it('crib label updates with deal number (deal 2 → Player2)', () => {
    render(<CribbageCapture {...defaultProps({ currentDeal: 2 })} />);
    expect(screen.getByTestId('crib-label')).toHaveTextContent("Player2's crib — Deal 2");
  });

  it('crib label wraps around for deal 3 with 2 players → Player1', () => {
    render(<CribbageCapture {...defaultProps({ currentDeal: 3 })} />);
    expect(screen.getByTestId('crib-label')).toHaveTextContent("Player1's crib — Deal 3");
  });
});

// ─── Dealer chip ─────────────────────────────────────────────────────────────────

describe('CribbageCapture: dealer chip', () => {
  it('shows Dealer/Crib badge on the dealer player panel', () => {
    const participations = makeParticipations(['p1', 'p2', 'p3']);
    render(
      <CribbageCapture {...defaultProps({ participations, currentDeal: 1 })} />,
    );
    // Deal 1 → seat 0 = p1
    expect(screen.getByTestId('dealer-chip-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('dealer-chip-p2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dealer-chip-p3')).not.toBeInTheDocument();
  });

  it('dealer chip on seat 1 for deal 2', () => {
    const participations = makeParticipations(['p1', 'p2', 'p3']);
    render(
      <CribbageCapture {...defaultProps({ participations, currentDeal: 2 })} />,
    );
    expect(screen.queryByTestId('dealer-chip-p1')).not.toBeInTheDocument();
    expect(screen.getByTestId('dealer-chip-p2')).toBeInTheDocument();
  });
});

// ─── Live totals display ─────────────────────────────────────────────────────────

describe('CribbageCapture: live totals from ScoreState', () => {
  it('shows live total from scoreState for each player', () => {
    const participations = [
      {
        id: 'p1',
        seat: 0,
        player: { id: 'player-p1', nickname: 'Player1', userId: null },
        scoreState: { payload: { rounds: [], totals: { p1: 42, p2: 17 } } },
      },
      {
        id: 'p2',
        seat: 1,
        player: { id: 'player-p2', nickname: 'Player2', userId: null },
        scoreState: { payload: { rounds: [], totals: { p1: 42, p2: 17 } } },
      },
    ];
    render(<CribbageCapture {...defaultProps({ participations })} />);
    expect(screen.getByTestId('live-total-p1')).toHaveTextContent('42');
    expect(screen.getByTestId('live-total-p2')).toHaveTextContent('17');
  });

  it('shows 0 when scoreState is null (fresh game)', () => {
    render(<CribbageCapture {...defaultProps()} />);
    expect(screen.getByTestId('live-total-p1')).toHaveTextContent('0');
    expect(screen.getByTestId('live-total-p2')).toHaveTextContent('0');
  });
});

// ─── addScore: quick buttons ──────────────────────────────────────────────────────

describe('CribbageCapture: +1/+2/+3 call addScore immediately', () => {
  it('+1 calls addScore(participationId, 1)', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-plus1-p1'));
    });
    expect(addScore).toHaveBeenCalledOnce();
    expect(addScore).toHaveBeenCalledWith('p1', 1);
  });

  it('+2 calls addScore(participationId, 2)', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-plus2-p2'));
    });
    expect(addScore).toHaveBeenCalledWith('p2', 2);
  });

  it('+3 calls addScore(participationId, 3)', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-plus3-p1'));
    });
    expect(addScore).toHaveBeenCalledWith('p1', 3);
  });

  it('+3 only calls addScore for the tapped player, not the other', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-plus3-p1'));
    });
    expect(addScore).toHaveBeenCalledOnce();
    expect(addScore).toHaveBeenCalledWith('p1', 3);
  });

  it('+1/+2/+3 are present with correct aria-labels', () => {
    render(<CribbageCapture {...defaultProps()} />);
    expect(screen.getByTestId('btn-plus1-p1')).toHaveAttribute('aria-label', '+1 for Player1');
    expect(screen.getByTestId('btn-plus2-p1')).toHaveAttribute('aria-label', '+2 for Player1');
    expect(screen.getByTestId('btn-plus3-p1')).toHaveAttribute('aria-label', '+3 for Player1');
  });
});

// ─── addScore: add field ──────────────────────────────────────────────────────────

describe('CribbageCapture: add field calls addScore on submit', () => {
  it('typing a value and clicking Add calls addScore with that value', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);

    fireEvent.change(screen.getByTestId('add-input-p1'), { target: { value: '7' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-btn-p1'));
    });

    expect(addScore).toHaveBeenCalledWith('p1', 7);
  });

  it('add field clears after Add is clicked', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);

    const input = screen.getByTestId('add-input-p1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('add-btn-p1'));
    });

    expect(input.value).toBe('');
  });

  it('pressing Enter in the add field calls addScore', async () => {
    const addScore = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ addScore })} />);

    fireEvent.change(screen.getByTestId('add-input-p1'), { target: { value: '4' } });
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('add-input-p1'), { key: 'Enter' });
    });

    expect(addScore).toHaveBeenCalledWith('p1', 4);
  });

  it('add field uses type=text with inputMode=numeric (no spin arrows)', () => {
    render(<CribbageCapture {...defaultProps()} />);
    const input = screen.getByTestId('add-input-p1') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('pattern', '[0-9]*');
  });
});

// ─── endDeal ─────────────────────────────────────────────────────────────────────

describe('CribbageCapture: End Deal', () => {
  it('End Deal button calls endDeal()', async () => {
    const endDeal = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ endDeal })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('end-deal-btn'));
    });
    expect(endDeal).toHaveBeenCalledOnce();
  });

  it('End Deal button is present with correct text', () => {
    render(<CribbageCapture {...defaultProps()} />);
    expect(screen.getByTestId('end-deal-btn')).toHaveTextContent('End Deal');
  });
});

// ─── onUndoLast ─────────────────────────────────────────────────────────────────

describe('CribbageCapture: undo last peg', () => {
  it('Undo last peg button calls onUndoLast()', async () => {
    const onUndoLast = vi.fn().mockResolvedValue(undefined);
    render(<CribbageCapture {...defaultProps({ onUndoLast })} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-last-btn'));
    });
    expect(onUndoLast).toHaveBeenCalledOnce();
  });

  it('Undo last peg button is enabled when not saving', () => {
    render(<CribbageCapture {...defaultProps({ saving: false })} />);
    expect(screen.getByTestId('undo-last-btn')).not.toBeDisabled();
  });

  it('Undo last peg button is disabled while saving', () => {
    render(<CribbageCapture {...defaultProps({ saving: true })} />);
    expect(screen.getByTestId('undo-last-btn')).toBeDisabled();
  });
});

// ─── Disabled state during saving ────────────────────────────────────────────────

describe('CribbageCapture: disabled while saving', () => {
  it('all quick buttons and End Deal are disabled when saving=true', () => {
    render(<CribbageCapture {...defaultProps({ saving: true })} />);
    expect(screen.getByTestId('btn-plus1-p1')).toBeDisabled();
    expect(screen.getByTestId('btn-plus2-p1')).toBeDisabled();
    expect(screen.getByTestId('btn-plus3-p1')).toBeDisabled();
    expect(screen.getByTestId('end-deal-btn')).toBeDisabled();
    expect(screen.getByTestId('undo-last-btn')).toBeDisabled();
  });
});

// ─── Win state detection ─────────────────────────────────────────────────────────

describe('CribbageCapture: win state disables scoring', () => {
  it('disables all scoring buttons when a player has reached the target', () => {
    const participations = [
      {
        id: 'p1',
        seat: 0,
        player: { id: 'player-p1', nickname: 'Player1', userId: null },
        // p1 has reached 121 (the target)
        scoreState: { payload: { rounds: [], totals: { p1: 121, p2: 40 } } },
      },
      {
        id: 'p2',
        seat: 1,
        player: { id: 'player-p2', nickname: 'Player2', userId: null },
        scoreState: { payload: { rounds: [], totals: { p1: 121, p2: 40 } } },
      },
    ];
    render(
      <CribbageCapture
        participations={participations}
        currentDeal={1}
        saving={false}
        target={121}
        addScore={vi.fn()}
        endDeal={vi.fn()}
        onUndoLast={vi.fn()}
      />,
    );

    // All pegging buttons and End Deal disabled
    expect(screen.getByTestId('btn-plus1-p1')).toBeDisabled();
    expect(screen.getByTestId('btn-plus2-p1')).toBeDisabled();
    expect(screen.getByTestId('btn-plus3-p1')).toBeDisabled();
    expect(screen.getByTestId('btn-plus1-p2')).toBeDisabled();
    expect(screen.getByTestId('end-deal-btn')).toBeDisabled();
    // Undo is still enabled so the mis-tap can be corrected
    expect(screen.getByTestId('undo-last-btn')).not.toBeDisabled();
  });

  it('enables all buttons when no player has reached the target', () => {
    const participations = [
      {
        id: 'p1',
        seat: 0,
        player: { id: 'player-p1', nickname: 'Player1', userId: null },
        scoreState: { payload: { rounds: [], totals: { p1: 80, p2: 60 } } },
      },
      {
        id: 'p2',
        seat: 1,
        player: { id: 'player-p2', nickname: 'Player2', userId: null },
        scoreState: { payload: { rounds: [], totals: { p1: 80, p2: 60 } } },
      },
    ];
    render(
      <CribbageCapture
        participations={participations}
        currentDeal={1}
        saving={false}
        target={121}
        addScore={vi.fn()}
        endDeal={vi.fn()}
        onUndoLast={vi.fn()}
      />,
    );
    expect(screen.getByTestId('btn-plus1-p1')).not.toBeDisabled();
    expect(screen.getByTestId('end-deal-btn')).not.toBeDisabled();
  });
});
