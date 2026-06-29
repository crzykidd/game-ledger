import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Permission, Role, ThemePref, UserState } from '@game-ledger/contract';
import { getMe, login as apiLogin, logout as apiLogout, patchMe } from '../api/auth';
import { ApiClientError } from '../api/client';
import { applyTheme } from '../lib/theme';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  fullName: string;
  role: Role;
  state: UserState;
  themePref: ThemePref;
  effectivePermissions: Permission[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  hasPermission(p: Permission): boolean;
  refreshUser(): Promise<void>;
  setTheme(pref: ThemePref): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const me = await getMe();
      const authUser: AuthUser = {
        ...me,
        themePref: me.themePref as ThemePref,
      };
      setUser(authUser);
      applyTheme(authUser.themePref);
      setError(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.error.statusCode === 401) {
        setUser(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load user');
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadUser().finally(() => setLoading(false));
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      await apiLogin(email, password);
      await loadUser();
    },
    [loadUser],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (p: Permission) => {
      return user?.effectivePermissions.includes(p) ?? false;
    },
    [user],
  );

  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  const setTheme = useCallback(async (pref: ThemePref) => {
    applyTheme(pref);
    const updated = await patchMe(pref);
    setUser((prev) =>
      prev
        ? {
            ...prev,
            themePref: updated.themePref as ThemePref,
          }
        : null,
    );
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, logout, hasPermission, refreshUser, setTheme }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
