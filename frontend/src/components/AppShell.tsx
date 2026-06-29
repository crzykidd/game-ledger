/**
 * AppShell — shared frosted navbar + page wrapper for all screens.
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Gamepad2,
  LayoutDashboard,
  Users,
  History,
  Shield,
  Moon,
  Sun,
  User,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import { Permission, ThemePref } from '@game-ledger/contract';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { cn } from './ui/utils';
import { VersionBadge } from './VersionBadge';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Nav item config ───────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

// ── Frosted top bar ───────────────────────────────────────────────────────────

interface TopNavProps {
  navItems: NavItem[];
}

function TopNav({ navItems }: TopNavProps) {
  const { user, logout, setTheme } = useAuth();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { scrollY } = useScroll();
  // Nav background fades in as user scrolls; at the top it is transparent
  const bgOpacity = useTransform(scrollY, [0, 60], [0, 1]);

  const handleThemeToggle = async () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? ThemePref.LIGHT : ThemePref.DARK;
    await setTheme(next);
  };

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  // Close menus on outside click
  const handleBackdropClick = () => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <motion.header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 h-14',
          'flex items-center justify-between px-4 sm:px-6',
        )}
      >
        {/* Scroll-driven frosted background */}
        <motion.div
          className={cn(
            'absolute inset-0 glass',
            'bg-white/80 dark:bg-slate-900/80',
            'border-b border-slate-200/60 dark:border-slate-700/60',
          )}
          style={{ opacity: bgOpacity }}
        />

        {/* Left: logo / brand */}
        <Link
          to="/"
          className={cn(
            'relative flex items-center gap-2',
            'text-slate-800 dark:text-slate-100 font-bold text-base',
            'hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150',
          )}
        >
          <Gamepad2 size={20} className="text-indigo-600 dark:text-indigo-400" />
          <span className="hidden sm:inline">Game Ledger</span>
        </Link>

        {/* Center: desktop nav links */}
        <nav className="relative hidden sm:flex items-center gap-1" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive =
              item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/80',
                )}
              >
                <item.icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: theme toggle + user */}
        <div className="relative flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={handleThemeToggle}
            aria-label="Toggle theme"
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center',
              'text-slate-500 dark:text-slate-400',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              'transition-colors duration-150',
            )}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* User avatar / menu */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="User menu"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-xs">{getInitials(user.nickname)}</AvatarFallback>
                </Avatar>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" aria-hidden onClick={handleBackdropClick} />
                  <div
                    role="menu"
                    className={cn(
                      'absolute right-0 top-full mt-2 w-52 z-50',
                      'bg-white dark:bg-slate-800',
                      'border border-slate-200 dark:border-slate-700',
                      'rounded-xl shadow-lg dark:shadow-slate-950/60',
                      'py-1 overflow-hidden',
                    )}
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Signed in as</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {user.nickname}
                      </p>
                    </div>
                    <Link
                      to="/profile"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm',
                        'text-slate-700 dark:text-slate-200',
                        'hover:bg-slate-50 dark:hover:bg-slate-700/60',
                        'transition-colors duration-100',
                      )}
                    >
                      <User size={14} />
                      Profile
                    </Link>
                    <button
                      role="menuitem"
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                      }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm',
                        'text-slate-700 dark:text-slate-200',
                        'hover:bg-slate-50 dark:hover:bg-slate-700/60',
                        'transition-colors duration-100',
                      )}
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            className={cn(
              'sm:hidden w-8 h-8 rounded-full flex items-center justify-center',
              'text-slate-500 dark:text-slate-400',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              'transition-colors duration-150',
            )}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </motion.header>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 dark:bg-slate-950/40"
            aria-hidden
            onClick={handleBackdropClick}
          />
          <div
            className={cn(
              'fixed top-14 left-0 right-0 z-40',
              'bg-white dark:bg-slate-900',
              'border-b border-slate-200 dark:border-slate-700',
              'shadow-lg dark:shadow-slate-950/60',
              'py-2 px-4',
            )}
          >
            {navItems.map((item) => {
              const isActive =
                item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-2 py-3 rounded-lg text-base font-medium',
                    'transition-colors duration-150',
                    isActive
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
  /**
   * Override nav items. Defaults to Dashboard / Players / History (+ Admin if the
   * current user has any admin permission).
   */
  navItems?: NavItem[];
}

const ADMIN_PERMISSIONS: Permission[] = [
  Permission.MANAGE_USERS,
  Permission.INVITE_USERS,
  Permission.SEND_PASSWORD_RESET,
  Permission.MANAGE_GROUPS_ROLES,
  Permission.VIEW_ALL,
];

export function AppShell({ children, navItems }: AppShellProps) {
  const { hasPermission } = useAuth();
  const hasAnyAdminAccess = ADMIN_PERMISSIONS.some((p) => hasPermission(p));

  const defaultNavItems: NavItem[] = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Players', to: '/players', icon: Users },
    { label: 'History', to: '/history', icon: History },
    ...(hasAnyAdminAccess ? [{ label: 'Admin', to: '/admin', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <TopNav navItems={navItems ?? defaultNavItems} />
      {/* pt-14 clears the fixed 56px header */}
      <div className="pt-14">{children}</div>
      {/* Subtle version indicator — bottom of every page */}
      <footer className="flex justify-center py-3">
        <VersionBadge />
      </footer>
    </div>
  );
}
