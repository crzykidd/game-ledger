/**
 * AcceptInvite — invite acceptance signup form.
 * Converted to Tailwind + shadcn-style foundation (Step 2 of UI migration).
 * All behavior, prefill, validation, and "email in use → forgot password?" handling are identical.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Dices, UserPlus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/utils';
import { apiClient, ApiClientError } from '../api/client';

interface InvitePrefill {
  email: string;
  fullName?: string;
}

interface AcceptInviteResponse {
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

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [prefill, setPrefill] = useState<InvitePrefill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!token) return;
    apiClient
      .get<InvitePrefill>(`/api/invites/accept/${token}`)
      .then((data) => {
        setPrefill(data);
        if (data.fullName) setFullName(data.fullName);
      })
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setLoadError(err.error.message);
        } else {
          setLoadError('Invalid or expired invitation.');
        }
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post<AcceptInviteResponse>(`/api/invites/accept/${token}`, {
        fullName,
        nickname,
        password,
      });
      navigate('/login', { state: { successMessage: 'Account created! Please sign in.' } });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.error.statusCode === 409) {
          setError('This email address is already in use. Please sign in instead.');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Failed to accept invite. Please try again.');
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
  if (!prefill && !loadError) {
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
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Game Ledger</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Invalid Invitation
              </h1>
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
            <UserPlus size={26} className="text-white" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Game Ledger</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Accept Invitation
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              Creating account for{' '}
              <strong className="text-slate-700 dark:text-slate-200">{prefill!.email}</strong>
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
                id="invite-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
              <AuthInput
                label="Nickname"
                id="invite-nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoComplete="username"
                required
              />
              <AuthInput
                label="Password"
                id="invite-password"
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
