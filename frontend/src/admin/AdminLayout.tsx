import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { Permission } from '@game-ledger/contract';
import { useAuth } from '../auth/AuthContext';
import { AppShell } from '../components/AppShell';
import { cn } from '../components/ui/utils';

interface AdminTab {
  to: string;
  label: string;
  permission: Permission;
}

const ADMIN_TABS: AdminTab[] = [
  { to: '/admin/users', label: 'Users', permission: Permission.MANAGE_USERS },
  { to: '/admin/invites', label: 'Invites', permission: Permission.INVITE_USERS },
  { to: '/admin/resets', label: 'Resets', permission: Permission.SEND_PASSWORD_RESET },
  { to: '/admin/groups', label: 'Groups', permission: Permission.MANAGE_GROUPS_ROLES },
  { to: '/admin/audit', label: 'Audit log', permission: Permission.VIEW_ALL },
  { to: '/admin/maintenance', label: 'Maintenance', permission: Permission.MANAGE_GLOBAL_SETTINGS },
];

export function AdminLayout() {
  const { hasPermission, loading } = useAuth();

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

  const visibleTabs = ADMIN_TABS.filter((tab) => hasPermission(tab.permission));

  if (visibleTabs.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <nav
          className="flex gap-0 border-b border-slate-200 dark:border-slate-700 mb-6 flex-wrap"
          aria-label="Admin sections"
        >
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 whitespace-nowrap',
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </AppShell>
  );
}
