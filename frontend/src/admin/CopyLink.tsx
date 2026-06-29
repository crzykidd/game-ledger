import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';

interface CopyLinkProps {
  link: string;
  label?: string;
}

export function CopyLink({ link, label = 'Copy link' }: CopyLinkProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copyToClipboard(text: string): Promise<boolean> {
    // navigator.clipboard is only exposed in a secure context (HTTPS/localhost); over
    // plain HTTP in the homelab it's undefined. Try it when present, else fall back to
    // the legacy execCommand approach.
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through to legacy copy */
      }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function handleCopy() {
    if (await copyToClipboard(link)) {
      setCopied(true);
      toast('Link copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast('Failed to copy — select and copy manually', 'error');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={link}
        readOnly
        aria-label="Generated link"
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className={cn(
          'flex-1 min-w-0 rounded-xl border px-3 py-2 text-sm',
          'border-slate-200 dark:border-slate-600',
          'bg-slate-50 dark:bg-slate-900',
          'text-slate-700 dark:text-slate-300',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
          'cursor-text select-all',
        )}
      />
      <Button variant="secondary" size="sm" onClick={handleCopy} aria-label={label}>
        {copied ? 'Copied!' : label}
      </Button>
    </div>
  );
}
