import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import {
  listPlayers,
  createPlayer,
  renamePlayer,
  listPlaygroups,
  createPlaygroup,
  renamePlaygroup,
  addPlaygroupMember,
  removePlaygroupMember,
  Player,
  Playgroup,
} from '../api/play';

// ─── Add Player Modal ──────────────────────────────────────────────────────────

function AddPlayerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Player) => void;
}) {
  const { toast } = useToast();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    setSaving(true);
    try {
      const p = await createPlayer(nickname.trim());
      onCreated(p);
      setNickname('');
      onClose();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to create player';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add guest player">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="player-nickname"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Nickname
          </label>
          <input
            id="player-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Bob"
            autoFocus
            className={cn(
              'w-full rounded-xl border px-3 py-2 text-sm',
              'border-slate-200 dark:border-slate-600',
              'bg-white dark:bg-slate-800',
              'text-slate-900 dark:text-slate-100',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            )}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!nickname.trim()}>
            Add player
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Rename Player Modal ───────────────────────────────────────────────────────

function RenamePlayerModal({
  open,
  player,
  onClose,
  onRenamed,
}: {
  open: boolean;
  player: Player | null;
  onClose: () => void;
  onRenamed: (p: Player) => void;
}) {
  const { toast } = useToast();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (player) setNickname(player.nickname);
  }, [player]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player || !nickname.trim()) return;
    setSaving(true);
    try {
      const p = await renamePlayer(player.id, nickname.trim());
      onRenamed(p);
      onClose();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to rename player';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Rename player">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="rename-player-nickname"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            New nickname
          </label>
          <input
            id="rename-player-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
            className={cn(
              'w-full rounded-xl border px-3 py-2 text-sm',
              'border-slate-200 dark:border-slate-600',
              'bg-white dark:bg-slate-800',
              'text-slate-900 dark:text-slate-100',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            )}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!nickname.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Create Playgroup Modal ────────────────────────────────────────────────────

function CreatePlaygroupModal({
  open,
  players,
  onClose,
  onCreated,
}: {
  open: boolean;
  players: Player[];
  onClose: () => void;
  onCreated: (pg: Playgroup) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const pg = await createPlaygroup(
        name.trim(),
        selectedIds.size > 0 ? [...selectedIds] : undefined,
      );
      onCreated(pg);
      setName('');
      setSelectedIds(new Set());
      onClose();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to create playgroup';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create playgroup">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="playgroup-name"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Playgroup name
          </label>
          <input
            id="playgroup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Game Night Crew"
            autoFocus
            className={cn(
              'w-full rounded-xl border px-3 py-2 text-sm',
              'border-slate-200 dark:border-slate-600',
              'bg-white dark:bg-slate-800',
              'text-slate-900 dark:text-slate-100',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            )}
          />
        </div>
        {players.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
              Initial members (optional)
            </p>
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
              {players.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => togglePlayer(p.id)}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-900 dark:text-slate-100">{p.nickname}</span>
                  {p.userId && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">(registered)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Manage Members Modal ──────────────────────────────────────────────────────

function ManageMembersModal({
  open,
  playgroup,
  players,
  onClose,
  onUpdated,
}: {
  open: boolean;
  playgroup: Playgroup | null;
  players: Player[];
  onClose: () => void;
  onUpdated: (pg: Playgroup) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!playgroup) return null;

  const memberIds = new Set(playgroup.members.map((m) => m.player.id));

  async function toggleMember(playerId: string) {
    if (!playgroup) return;
    setSaving(true);
    try {
      let updated: Playgroup;
      if (memberIds.has(playerId)) {
        updated = await removePlaygroupMember(playgroup.id, playerId);
      } else {
        updated = await addPlaygroupMember(playgroup.id, playerId);
      }
      onUpdated(updated);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to update member';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Members — ${playgroup.name}`}>
      <div className="flex flex-col gap-3">
        {players.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No players yet. Add guest players first.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
            {players.map((p) => (
              <label
                key={p.id}
                className={cn(
                  'flex items-center gap-2 min-h-[44px]',
                  saving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  checked={memberIds.has(p.id)}
                  onChange={() => toggleMember(p.id)}
                  disabled={saving}
                  className="rounded"
                />
                <span className="text-sm text-slate-900 dark:text-slate-100">{p.nickname}</span>
                {p.userId && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">(registered)</span>
                )}
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Rename Playgroup Modal ────────────────────────────────────────────────────

function RenamePlaygroupModal({
  open,
  playgroup,
  onClose,
  onRenamed,
}: {
  open: boolean;
  playgroup: Playgroup | null;
  onClose: () => void;
  onRenamed: (pg: Playgroup) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (playgroup) setName(playgroup.name);
  }, [playgroup]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playgroup || !name.trim()) return;
    setSaving(true);
    try {
      const updated = await renamePlaygroup(playgroup.id, name.trim());
      onRenamed(updated);
      onClose();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to rename playgroup';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Rename playgroup">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="rename-playgroup-name"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            New name
          </label>
          <input
            id="rename-playgroup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className={cn(
              'w-full rounded-xl border px-3 py-2 text-sm',
              'border-slate-200 dark:border-slate-600',
              'bg-white dark:bg-slate-800',
              'text-slate-900 dark:text-slate-100',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            )}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function PlayersPage() {
  const { toast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [playgroups, setPlaygroups] = useState<Playgroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [renamePlayerTarget, setRenamePlayerTarget] = useState<Player | null>(null);

  const [createPlaygroupOpen, setCreatePlaygroupOpen] = useState(false);
  const [membersTarget, setMembersTarget] = useState<Playgroup | null>(null);
  const [renamePlaygroupTarget, setRenamePlaygroupTarget] = useState<Playgroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, pgs] = await Promise.all([listPlayers(), listPlaygroups()]);
      setPlayers(ps);
      setPlaygroups(pgs);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load players';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div
            className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        {/* My Roster */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My Roster</CardTitle>
              <Button size="sm" onClick={() => setAddPlayerOpen(true)}>
                Add guest player
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {players.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <UserPlus size={36} className="text-slate-300 dark:text-slate-600 mb-3" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No players yet
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Add a guest player to get started.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {p.nickname}
                      </span>
                      {p.userId && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                          registered
                        </span>
                      )}
                    </div>
                    {!p.userId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRenamePlayerTarget(p)}
                      >
                        Rename
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Playgroups */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My Playgroups</CardTitle>
              <Button size="sm" onClick={() => setCreatePlaygroupOpen(true)}>
                Create playgroup
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {playgroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users size={36} className="text-slate-300 dark:text-slate-600 mb-3" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No playgroups yet
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create a playgroup to quickly select your regular crew.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {playgroups.map((pg) => (
                  <div
                    key={pg.id}
                    className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {pg.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {pg.members.length} member{pg.members.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setMembersTarget(pg)}>
                        Members
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRenamePlaygroupTarget(pg)}
                      >
                        Rename
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Modals */}
      <AddPlayerModal
        open={addPlayerOpen}
        onClose={() => setAddPlayerOpen(false)}
        onCreated={(p) => setPlayers((prev) => [...prev, p])}
      />

      <RenamePlayerModal
        open={!!renamePlayerTarget}
        player={renamePlayerTarget}
        onClose={() => setRenamePlayerTarget(null)}
        onRenamed={(p) => setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
      />

      <CreatePlaygroupModal
        open={createPlaygroupOpen}
        players={players}
        onClose={() => setCreatePlaygroupOpen(false)}
        onCreated={(pg) => setPlaygroups((prev) => [...prev, pg])}
      />

      <ManageMembersModal
        open={!!membersTarget}
        playgroup={membersTarget}
        players={players}
        onClose={() => setMembersTarget(null)}
        onUpdated={(pg) => {
          setPlaygroups((prev) => prev.map((x) => (x.id === pg.id ? pg : x)));
          setMembersTarget(pg);
        }}
      />

      <RenamePlaygroupModal
        open={!!renamePlaygroupTarget}
        playgroup={renamePlaygroupTarget}
        onClose={() => setRenamePlaygroupTarget(null)}
        onRenamed={(pg) => setPlaygroups((prev) => prev.map((x) => (x.id === pg.id ? pg : x)))}
      />
    </AppShell>
  );
}
