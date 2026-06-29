/**
 * InstallWizard — first-run Super Admin setup.
 * Converted to Tailwind + shadcn-style foundation (Step 2 of UI migration).
 * Behavior, fields, one-time guard, and post-setup auth flow are identical.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Dices } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/utils';
import { getSetupStatus, postSetup } from '../api/setup';
import { useAuth } from '../auth/AuthContext';
import { ApiClientError } from '../api/client';

// Shared auth page wrapper (inline — no extra file needed)
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

// Reusable text input for auth forms
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

export function InstallWizard() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    getSetupStatus()
      .then((res) => {
        if (res.setupComplete) {
          navigate('/', { replace: true });
        }
      })
      .catch(() => {
        // If we can't check, proceed to show form
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await postSetup({ fullName, nickname, email, password });
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Setup failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <AuthPageShell>
        <div className="relative flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      </AuthPageShell>
    );
  }

  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: { type: 'spring' as const, stiffness: 280, damping: 22 },
      };

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
            <Dices size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Game Ledger</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Welcome to Game Ledger
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              Create your administrator account to get started.
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
                label="Full name"
                id="wizard-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
              <AuthInput
                label="Nickname"
                id="wizard-nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoComplete="username"
                required
              />
              <AuthInput
                label="Email"
                id="wizard-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <AuthInput
                label="Password"
                id="wizard-password"
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
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </AuthPageShell>
  );
}
