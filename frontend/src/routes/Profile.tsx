/**
 * Profile — user info + theme toggle + logout.
 * Converted to Tailwind + shadcn-style foundation (Step 2 of UI migration).
 * Behavior is identical to the original (setTheme, logout, navigate).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Sun, Moon, Monitor, LogOut, User } from 'lucide-react';
import { ThemePref } from '@game-ledger/contract';
import { useAuth } from '../auth/AuthContext';
import { AppShell } from '../components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar, AvatarFallback } from '../components/ui/Avatar';
import { cn } from '../components/ui/utils';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Theme option button ──────────────────────────────────────────────────────

interface ThemeOptionProps {
  label: string;
  icon: React.ElementType;
  value: ThemePref;
  current: ThemePref;
  onSelect: (v: ThemePref) => void;
}

function ThemeOption({ label, icon: Icon, value, current, onSelect }: ThemeOptionProps) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={isActive}
      className={cn(
        'flex flex-1 flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-medium',
        'border transition-all duration-150',
        isActive
          ? [
              'bg-indigo-50 dark:bg-indigo-900/40',
              'border-indigo-300 dark:border-indigo-700',
              'text-indigo-700 dark:text-indigo-300',
              'shadow-sm',
            ]
          : [
              'bg-white dark:bg-slate-800/60',
              'border-slate-200 dark:border-slate-700',
              'text-slate-600 dark:text-slate-300',
              'hover:bg-slate-50 dark:hover:bg-slate-700/60',
            ],
      )}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// ── Profile row ──────────────────────────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function Profile() {
  const { user, logout, setTheme } = useAuth();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { type: 'spring' as const, stiffness: 280, damping: 22 },
      };

  return (
    <AppShell>
      <div className="fixed inset-0 pointer-events-none gradient-mesh" aria-hidden />

      <main className="relative pb-16 px-4 sm:px-6 max-w-lg mx-auto pt-8">
        <motion.div className="flex flex-col gap-5" {...motionProps}>
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="text-base">{getInitials(user.nickname)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {user.nickname}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>

          {/* Info card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
                <User size={14} />
                Account info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ProfileRow label="Nickname" value={user.nickname} />
              <ProfileRow label="Full name" value={user.fullName} />
              <ProfileRow label="Email" value={user.email} />
              <ProfileRow label="Role" value={user.role} />
            </CardContent>
          </Card>

          {/* Theme card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
                <Sun size={14} />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Choose how Game Ledger looks to you.
              </p>
              <div className="flex gap-2">
                <ThemeOption
                  label="Light"
                  icon={Sun}
                  value={ThemePref.LIGHT}
                  current={user.themePref}
                  onSelect={setTheme}
                />
                <ThemeOption
                  label="Dark"
                  icon={Moon}
                  value={ThemePref.DARK}
                  current={user.themePref}
                  onSelect={setTheme}
                />
                <ThemeOption
                  label="System"
                  icon={Monitor}
                  value={ThemePref.SYSTEM}
                  current={user.themePref}
                  onSelect={setTheme}
                />
              </div>
            </CardContent>
          </Card>

          {/* Sign out */}
          <Button
            variant="danger"
            size="md"
            onClick={handleLogout}
            className="flex items-center gap-2 self-start"
          >
            <LogOut size={15} />
            Log out
          </Button>
        </motion.div>
      </main>
    </AppShell>
  );
}
