import React, { createContext, useCallback, useContext, useState } from 'react';
import { cn } from './utils';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast(message: string, type?: ToastType): void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

function Toaster({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-4 right-4 flex flex-col gap-2 z-[100] pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
            'rounded-lg shadow-lg max-w-[360px] px-4 py-3 pointer-events-auto',
            'border-l-4',
            t.type === 'success' && 'border-l-green-500',
            t.type === 'error' && 'border-l-red-500',
            t.type === 'info' && 'border-l-indigo-500',
          )}
        >
          <span className="text-sm text-slate-800 dark:text-slate-200">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
