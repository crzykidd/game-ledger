/**
 * PasswordReset — token-based password reset form.
 * Converted to Tailwind + shadcn-style foundation (Step 2 of UI migration).
 * Behavior, token validation, and navigation are identical to the original.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { KeyRound, Dices } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/utils';
import { apiClient, ApiClientError } from '../api/client';

interface ResetTokenInfo {
  email: string;
}

interface ResetResponse {
  message: string;
}

// Shared auth page shell
function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center',
        'bg-slate-50 dark:bg-slate-950 px-4 py-12',
      )}
    >
      <div className="fixed inset-0 pointer-events-none gradient-mesh" aria-hidden />
      {children}
    </div>
  );
}

// Reusable labeled input
function AuthInput({
  label,
  id,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className={cn(
          'w-full h-10 px-3 rounded-xl text-sm',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-slate-700',
          'text-slate-900 dark:text-slate-100',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
          'transition-colors duration-150',
        )}
      />
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export function PasswordReset() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [tokenInfo, setTokenInfo] = useState<ResetTokenInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!token) return;
    apiClient
      .get<ResetTokenInfo>(`/api/resets/${token}`)
      .then((data) => setTokenInfo(data))
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setLoadError(err.error.message);
        } else {
          setLoadError('Invalid or expired reset link.');
        }
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post<ResetResponse>(`/api/resets/${token}`, { password });
      navigate('/login', {
        state: { successMessage: 'Password reset! Please sign in with your new password.' },
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Reset failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: { type: 'spring' as const, stiffness: 280, damping: 22 },
      };

  // Loading state
  if (!tokenInfo && !loadError) {
    return (
      <AuthPageShell>
        <div className="relative flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      </AuthPageShell>
    );
  }

  // Token error state
  if (loadError) {
    return (
      <AuthPageShell>
        <motion.div className="relative w-full max-w-sm" {...motionProps}>
          <div className="flex flex-col items-center mb-8">
            <div
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center mb-3',
                'bg-gradient-to-br from-red-500 to-red-700',
                'shadow-lg shadow-red-500/30',
              )}
            >
              <Dices size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Game Ledger</h1>
          </div>
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Invalid Reset Link
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{loadError}</p>
            </CardContent>
          </Card>
        </motion.div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <motion.div className="relative w-full max-w-sm" {...motionProps}>
        {/* Brand logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center mb-3',
              'bg-gradient-to-br from-indigo-500 to-indigo-700',
              'shadow-lg shadow-indigo-500/30',
            )}
          >
            <KeyRound size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Game Ledger</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Reset Password
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              Resetting password for{' '}
              <strong className="text-slate-700 dark:text-slate-200">{tokenInfo!.email}</strong>
            </p>

            {error && (
              <div
                role="alert"
                className={cn(
                  'mb-4 px-3 py-2.5 rounded-xl text-sm',
                  'bg-red-50 dark:bg-red-900/20',
                  'text-red-700 dark:text-red-400',
                  'border border-red-200 dark:border-red-800/60',
                )}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <AuthInput
                label="New password"
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                hint="At least 10 characters with upper, lower, and a digit"
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-1"
                disabled={submitting}
                aria-disabled={submitting}
              >
                {submitting ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </AuthPageShell>
  );
}
