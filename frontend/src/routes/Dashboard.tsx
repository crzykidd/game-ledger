/**
 * Dashboard — main landing page after login.
 *
 * Built on the shared Tailwind + shadcn-style foundation (src/components/ui/).
 * Wired to real data: useAuth() for the user, GET /api/games for active games.
 * Stats strip is clearly labelled sample data until the stats feature ships.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import {
  Plus,
  Play,
  Gamepad2,
  Trophy,
  BarChart3,
  Users,
  Clock,
  ChevronRight,
  Star,
  Zap,
  Target,
} from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import { listGames, listModules, GameSummary, ModuleInfo } from '../api/play';
import { ApiClientError } from '../api/client';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar, AvatarFallback } from '../components/ui/Avatar';
import { Skeleton } from '../components/ui/Skeleton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { cn } from '../components/ui/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Animation variants ────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 22 },
  },
};

// ── Mock stats ────────────────────────────────────────────────────────────────

const MOCK_STATS = [
  { label: 'Games played', value: '47', icon: Gamepad2, color: 'text-indigo-500' },
  { label: 'Wins', value: '23', icon: Trophy, color: 'text-amber-500' },
  { label: 'Win rate', value: '49%', icon: Target, color: 'text-emerald-500' },
  { label: 'Avg. players', value: '3.4', icon: Users, color: 'text-blue-500' },
];

// ── Filter type ───────────────────────────────────────────────────────────────

type Filter = 'all' | 'recent' | 'friends';

const FILTER_OPTIONS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Recent', value: 'recent' },
  { label: 'With friends', value: 'friends' },
];

// ── Active game card ──────────────────────────────────────────────────────────

interface ActiveGameCardProps {
  game: GameSummary;
  moduleName: string;
  index: number;
}

function ActiveGameCard({ game, moduleName, index }: ActiveGameCardProps) {
  const navigate = useNavigate();
  const players = game.participations.map((p) => p.player.nickname);
  const playerCount = players.length;

  return (
    <motion.div
      variants={cardVariants}
      custom={index}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => navigate(`/play/${game.id}`)}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={cn(
        'relative overflow-hidden rounded-2xl cursor-pointer group',
        // Light: white card, visible border; Dark: lifted slate surface with stronger border
        'bg-white dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700',
        'shadow-sm dark:shadow-md dark:shadow-slate-950/50',
        'hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700/60',
        'dark:hover:shadow-lg dark:hover:shadow-slate-950/70',
        'transition-shadow transition-border duration-200',
        'p-4',
      )}
      // Stable testid for e2e selectors (replaces the old .active-game-row class)
      data-testid="active-game-card"
    >
      {/* Top gradient accent stripe */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity duration-200" />

      <div className="flex items-center justify-between gap-3">
        {/* Left: game info */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Game icon */}
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
              'bg-indigo-50 dark:bg-indigo-900/50',
              'border border-indigo-100 dark:border-indigo-800/60',
            )}
          >
            <Gamepad2 size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {/* Module name — testid for e2e compat with old .active-game-row__module */}
              <span
                className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
                data-testid="active-game-row__module"
              >
                {moduleName}
              </span>
              <Badge variant="active" className="shrink-0">
                <Zap size={10} />
                Active
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Users size={11} />
                {playerCount} {playerCount === 1 ? 'player' : 'players'}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {formatRelativeTime(game.startedAt)}
              </span>
            </div>
            {/* Player initials row */}
            <div className="flex items-center gap-1 mt-1.5">
              {players.slice(0, 5).map((name, i) => (
                <div
                  key={i}
                  title={name}
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center',
                    'text-[9px] font-bold',
                    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200',
                    'border border-white dark:border-slate-800',
                    i > 0 && '-ml-1',
                  )}
                >
                  {getInitials(name)}
                </div>
              ))}
              {players.length > 5 && (
                <span className="text-[9px] text-slate-400 dark:text-slate-400 ml-0.5">
                  +{players.length - 5}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: resume CTA */}
        <motion.div
          whileHover={{ x: 2 }}
          className={cn(
            'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
            'bg-indigo-50 dark:bg-indigo-900/50',
            'text-indigo-600 dark:text-indigo-300 text-sm font-medium',
            'border border-indigo-100 dark:border-indigo-800/60',
            'group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/70',
            'transition-colors duration-150',
          )}
        >
          <Play size={13} className="fill-current" />
          Resume
          <ChevronRight size={13} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip() {
  return (
    <motion.div variants={itemVariants}>
      <div className="flex items-center gap-1.5 mb-3">
        <BarChart3 size={14} className="text-slate-400 dark:text-slate-500" />
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Your stats
        </span>
        <span className="text-xs text-slate-300 dark:text-slate-600 ml-1 italic">
          (sample data)
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MOCK_STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            variants={cardVariants}
            custom={i}
            className={cn(
              'relative overflow-hidden rounded-2xl p-4',
              'bg-white dark:bg-slate-800',
              'border border-slate-200 dark:border-slate-700',
              'shadow-sm dark:shadow-md dark:shadow-slate-950/50',
            )}
          >
            <stat.icon size={18} className={cn('mb-2', stat.color)} />
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-none mb-1">
              {stat.value}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-300">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function ActiveGamesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-8 w-20 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyGames() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center rounded-2xl',
        'border border-dashed border-slate-200 dark:border-slate-700',
        'bg-slate-50/50 dark:bg-slate-800/30',
      )}
    >
      <motion.div
        animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
        transition={{ duration: 1.2, delay: 0.3 }}
        className="mb-4"
      >
        <Gamepad2 size={44} className="text-slate-300 dark:text-slate-600" />
      </motion.div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
        No active games
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-300 mb-5 max-w-xs">
        Start a new game to get the ball rolling!
      </p>
      <Link to="/play/new">
        <Button size="sm" variant="primary">
          <Plus size={14} />
          Start a game
        </Button>
      </Link>
    </motion.div>
  );
}

// ── Start New Game CTA ────────────────────────────────────────────────────────

function StartGameCTA() {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div variants={itemVariants}>
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl p-6 sm:p-8',
          'bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700',
          'shadow-xl shadow-indigo-500/20 dark:shadow-indigo-900/40',
          'border border-indigo-500/30',
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Background orbs */}
        <motion.div
          animate={{ scale: hovered ? 1.15 : 1, opacity: hovered ? 0.4 : 0.25 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-indigo-400/30 blur-2xl pointer-events-none"
        />
        <motion.div
          animate={{ scale: hovered ? 1.2 : 1, opacity: hovered ? 0.3 : 0.15 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
          className="absolute -bottom-8 -left-4 w-40 h-40 rounded-full bg-purple-400/30 blur-2xl pointer-events-none"
        />

        {/* Floating star */}
        <motion.div
          animate={{ y: hovered ? -4 : 0, rotate: hovered ? 15 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="absolute top-4 right-6 text-indigo-300/60"
        >
          <Star size={20} />
        </motion.div>

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <motion.h2
              animate={{ y: hovered ? -1 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="text-xl sm:text-2xl font-bold text-white mb-1"
            >
              Ready to play?
            </motion.h2>
            <p className="text-indigo-200 text-sm">Track scores, compete with friends.</p>
          </div>

          <Link to="/play/new" className="shrink-0">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'flex items-center gap-2.5 px-6 py-3 rounded-2xl',
                'bg-white text-indigo-700 font-semibold text-sm',
                'shadow-lg shadow-indigo-900/20',
                'hover:bg-indigo-50 transition-colors duration-150',
              )}
            >
              <Plus size={18} />
              Start New Game
              <motion.span
                animate={{ x: hovered ? 3 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <ChevronRight size={16} />
              </motion.span>
            </motion.button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  const [games, setGames] = useState<GameSummary[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, mods] = await Promise.all([
        listGames(),
        listModules().catch(() => [] as ModuleInfo[]),
      ]);
      setGames(data);
      setModules(mods);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load games';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeGames = games.filter((g) => g.status === 'ACTIVE');
  const moduleNameMap = Object.fromEntries(modules.map((m) => [m.id, m.name]));

  const filteredGames = activeGames.filter((g) => {
    if (filter === 'recent') {
      return Date.now() - new Date(g.startedAt).getTime() < 24 * 60 * 60 * 1000;
    }
    if (filter === 'friends') {
      return g.participations.length > 1;
    }
    return true;
  });

  const motionConfig = prefersReducedMotion
    ? { initial: false, animate: 'visible' as const }
    : { initial: 'hidden' as const, animate: 'visible' as const };

  return (
    <AppShell>
      {/* Subtle background gradient */}
      <div className="fixed inset-0 pointer-events-none gradient-mesh" aria-hidden />

      <main className="relative pb-16 px-4 sm:px-6 max-w-2xl mx-auto">
        <motion.div
          variants={containerVariants}
          {...motionConfig}
          className="flex flex-col gap-6 pt-6"
        >
          {/* Welcome header */}
          <motion.div variants={itemVariants} className="pt-2">
            <div className="flex items-center gap-3 mb-1">
              <Avatar className="w-11 h-11">
                <AvatarFallback className="text-sm">
                  {user ? getInitials(user.nickname) : '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  Hey, {user?.nickname ?? 'there'}!
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  {activeGames.length > 0
                    ? `${activeGames.length} game${activeGames.length !== 1 ? 's' : ''} in progress`
                    : "Let's start something new"}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Start new game CTA */}
          <StartGameCTA />

          {/* Stats strip */}
          <StatsStrip />

          {/* Active games section */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Active Games
                </h2>
                {!loading && activeGames.length > 0 && (
                  <Badge variant="muted">{activeGames.length}</Badge>
                )}
              </div>
              <Link
                to="/history"
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors duration-150 flex items-center gap-1"
              >
                History
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Segmented filter — only when there are games */}
            {!loading && activeGames.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-4"
              >
                <SegmentedControl<Filter>
                  options={FILTER_OPTIONS}
                  value={filter}
                  onChange={setFilter}
                  aria-label="Game filter"
                />
              </motion.div>
            )}

            {/* Games list */}
            {loading ? (
              <ActiveGamesSkeleton />
            ) : error ? (
              <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            ) : filteredGames.length === 0 ? (
              <EmptyGames />
            ) : (
              <motion.div
                variants={containerVariants}
                initial={prefersReducedMotion ? false : 'hidden'}
                animate="visible"
                className="flex flex-col gap-3"
              >
                <AnimatePresence mode="popLayout">
                  {filteredGames.map((g, i) => (
                    <ActiveGameCard
                      key={g.id}
                      game={g}
                      moduleName={moduleNameMap[g.moduleKey] ?? g.moduleKey}
                      index={i}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>

          {/* Quick links */}
          <motion.div variants={itemVariants} className="flex gap-3 flex-wrap">
            <Link to="/players">
              <Button variant="secondary" size="md">
                <Users size={15} />
                Players &amp; Groups
              </Button>
            </Link>
            <Link to="/history">
              <Button variant="secondary" size="md">
                <BarChart3 size={15} />
                Full History
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </main>
    </AppShell>
  );
}
