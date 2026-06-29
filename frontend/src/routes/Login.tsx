/**
 * Login — converted to Tailwind + shadcn-style foundation (Step 2 of UI migration).
 * All behavior, validation, and API calls are identical to the original.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Dices, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiClientError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { cn } from '../components/ui/utils';

interface LoginProps {
  successMessage?: string;
}

export function Login({ successMessage }: LoginProps) {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLockoutMessage(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        const msg = err.error.message;
        if (msg.toLowerCase().includes('locked')) {
          const minuteMatch = msg.match(/(\d+)\s+minute/i);
          const secondMatch = msg.match(/(\d+)\s+second/i);
          if (minuteMatch) {
            setLockoutMessage(`Account locked. Try again in ${minuteMatch[1]} minutes.`);
          } else if (secondMatch) {
            const seconds = parseInt(secondMatch[1], 10);
            const minutes = Math.ceil(seconds / 60);
            setLockoutMessage(
              `Account locked. Try again in about ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
            );
          } else {
            setLockoutMessage(msg);
          }
        } else {
          setError(msg);
        }
      } else {
        setError('Login failed. Please try again.');
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

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center',
        'bg-slate-50 dark:bg-slate-950',
        'px-4 py-12',
      )}
    >
      {/* Subtle background gradient */}
      <div className="fixed inset-0 pointer-events-none gradient-mesh" aria-hidden />

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
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track scores, compete with friends
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* Card heading */}
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Sign in
            </h2>

            {/* Success message (e.g. "Account created! Please sign in.") */}
            {successMessage && (
              <div
                className={cn(
                  'mb-4 px-3 py-2.5 rounded-xl text-sm',
                  'bg-emerald-50 dark:bg-emerald-900/20',
                  'text-emerald-700 dark:text-emerald-400',
                  'border border-emerald-200 dark:border-emerald-800/60',
                )}
              >
                {successMessage}
              </div>
            )}

            {/* Lockout / error alerts */}
            {(lockoutMessage || error) && (
              <div
                role="alert"
                className={cn(
                  'mb-4 px-3 py-2.5 rounded-xl text-sm',
                  'bg-red-50 dark:bg-red-900/20',
                  'text-red-700 dark:text-red-400',
                  'border border-red-200 dark:border-red-800/60',
                )}
              >
                {lockoutMessage ?? error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="login-email"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
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
              </div>

              {/* Password with show/hide */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="login-password"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className={cn(
                      'w-full h-10 px-3 pr-10 rounded-xl text-sm',
                      'bg-white dark:bg-slate-900',
                      'border border-slate-200 dark:border-slate-700',
                      'text-slate-900 dark:text-slate-100',
                      'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                      'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                      'transition-colors duration-150',
                    )}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide' : 'Show'}
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className={cn(
                      'absolute right-2.5 top-1/2 -translate-y-1/2',
                      'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
                      'transition-colors duration-150',
                    )}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-1"
                disabled={submitting}
                aria-disabled={submitting}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
