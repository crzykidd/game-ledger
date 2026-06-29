import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Role } from '@game-ledger/contract';
import {
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  restoreFromUpload,
  getMaintenanceSettings,
  updateMaintenanceSettings,
  runMaintenance,
  BackupItem,
  MaintenanceSettings,
  MaintenanceRunResult,
} from '../api/admin';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Backups section ──────────────────────────────────────────────────────────

interface BackupsSectionProps {
  isSuperAdmin: boolean;
}

function BackupsSection({ isSuperAdmin }: BackupsSectionProps) {
  const { toast } = useToast();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBackups();
      setBackups(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load backups';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setActionLoading(true);
    try {
      await createBackup();
      toast('Backup created', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to create backup';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(`Delete backup "${name}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await deleteBackup(name);
      toast('Backup deleted', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to delete backup';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestore(name: string) {
    if (
      !window.confirm(
        `Restore from "${name}"? This will overwrite ALL current data. The app will need to be restarted after restore.`,
      )
    )
      return;
    setActionLoading(true);
    try {
      await restoreBackup(name);
      toast('Restore initiated — restart the app to complete', 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to restore backup';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Backups</h2>
        <Button onClick={handleCreate} loading={actionLoading} disabled={loading}>
          Create backup
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div
            className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
        </div>
      ) : backups.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
          No backups yet. Click &quot;Create backup&quot; to create one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Name', 'Size', 'Created', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {backups.map((row) => (
                <tr
                  key={row.name}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-mono text-xs">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {formatBytes(row.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <a
                        href={`/api/maintenance/backups/${encodeURIComponent(row.name)}/download`}
                        className={cn(
                          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl',
                          'font-medium transition-all duration-200 h-8 px-3 text-sm',
                          'bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200',
                          'border border-slate-200/80 dark:border-slate-700/80',
                          'hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-sm',
                        )}
                        download
                      >
                        Download
                      </a>
                      {isSuperAdmin && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRestore(row.name)}
                          disabled={actionLoading}
                        >
                          Restore
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(row.name)}
                        disabled={actionLoading}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Restore-from-upload section ──────────────────────────────────────────────

function RestoreUploadSection() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleRestore() {
    if (!file) return;
    if (
      !window.confirm(
        'This will PERMANENTLY overwrite ALL current data with the uploaded file. This cannot be undone. Are you sure?',
      )
    )
      return;
    setLoading(true);
    try {
      await restoreFromUpload(file);
      toast('Restore initiated — restart the app to complete', 'success');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to restore from upload';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Restore from upload
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload a <code className="font-mono text-xs">.dump</code> file to restore the database.
        <strong className="text-red-600 dark:text-red-400"> This overwrites all current data.</strong>
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          ref={fileRef}
          type="file"
          accept=".dump"
          aria-label="Backup file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={cn(
            'text-sm text-slate-700 dark:text-slate-200',
            'file:mr-3 file:py-1.5 file:px-3 file:rounded-lg',
            'file:border file:border-slate-200 dark:file:border-slate-600',
            'file:bg-white dark:file:bg-slate-800',
            'file:text-sm file:font-medium file:text-slate-700 dark:file:text-slate-200',
            'file:cursor-pointer',
          )}
        />
        <Button variant="danger" onClick={handleRestore} loading={loading} disabled={!file}>
          Restore from upload
        </Button>
      </div>
      {file && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Selected: {file.name} ({formatBytes(file.size)})
        </p>
      )}
    </div>
  );
}

// ─── Settings form section ────────────────────────────────────────────────────

function SettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<MaintenanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Controlled form state
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupCron, setBackupCron] = useState('');
  const [backupRetention, setBackupRetention] = useState(0);
  const [reindexEnabled, setReindexEnabled] = useState(false);
  const [reindexCron, setReindexCron] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMaintenanceSettings();
      setSettings(data);
      setBackupEnabled(data.backupEnabled);
      setBackupCron(data.backupCron ?? '');
      setBackupRetention(data.backupRetention);
      setReindexEnabled(data.reindexEnabled);
      setReindexCron(data.reindexCron ?? '');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load settings';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateMaintenanceSettings({
        backupEnabled,
        backupCron: backupCron.trim() || null,
        backupRetention,
        reindexEnabled,
        reindexCron: reindexCron.trim() || null,
      });
      setSettings(updated);
      toast('Settings saved', 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to save settings';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div
          className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Schedule &amp; retention
      </h2>

      {/* Backup settings */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          Backups
        </legend>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={backupEnabled}
            onChange={(e) => setBackupEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-indigo-600"
            aria-label="Backup enabled"
          />
          <span className="text-sm text-slate-700 dark:text-slate-200">Enable scheduled backups</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="backup-cron"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Backup cron
            </label>
            <input
              id="backup-cron"
              type="text"
              value={backupCron}
              onChange={(e) => setBackupCron(e.target.value)}
              placeholder="0 3 * * *"
              className={cn(
                'rounded-xl border px-3 py-2 text-sm font-mono',
                'border-slate-200 dark:border-slate-600',
                'bg-white dark:bg-slate-800',
                'text-slate-900 dark:text-slate-100',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              )}
              disabled={!backupEnabled}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="backup-retention"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Retention count <span className="font-normal text-slate-500">(0 = keep all)</span>
            </label>
            <input
              id="backup-retention"
              type="number"
              min={0}
              value={backupRetention}
              onChange={(e) => setBackupRetention(Number(e.target.value))}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
                'border-slate-200 dark:border-slate-600',
                'bg-white dark:bg-slate-800',
                'text-slate-900 dark:text-slate-100',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              )}
            />
          </div>
        </div>
      </fieldset>

      {/* Reindex settings */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
          Reindex
        </legend>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={reindexEnabled}
            onChange={(e) => setReindexEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-indigo-600"
            aria-label="Reindex enabled"
          />
          <span className="text-sm text-slate-700 dark:text-slate-200">Enable scheduled reindex</span>
        </label>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reindex-cron"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Reindex cron
          </label>
          <input
            id="reindex-cron"
            type="text"
            value={reindexCron}
            onChange={(e) => setReindexCron(e.target.value)}
            placeholder="0 4 * * 0"
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-mono max-w-xs',
              'border-slate-200 dark:border-slate-600',
              'bg-white dark:bg-slate-800',
              'text-slate-900 dark:text-slate-100',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            )}
            disabled={!reindexEnabled}
          />
        </div>
      </fieldset>

      {settings && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

// ─── Run maintenance section ──────────────────────────────────────────────────

function RunMaintenanceSection() {
  const { toast } = useToast();
  const [vacuumLoading, setVacuumLoading] = useState(false);
  const [reindexLoading, setReindexLoading] = useState(false);
  const [lastResult, setLastResult] = useState<MaintenanceRunResult | null>(null);

  async function handleRun(kind: 'vacuum' | 'reindex') {
    const setLoading = kind === 'vacuum' ? setVacuumLoading : setReindexLoading;
    setLoading(true);
    try {
      const result = await runMaintenance(kind);
      setLastResult(result);
      toast(`${kind === 'vacuum' ? 'Vacuum' : 'Reindex'} completed in ${result.durationMs}ms`, 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : `Failed to run ${kind}`;
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Run maintenance
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => handleRun('vacuum')}
          loading={vacuumLoading}
          disabled={reindexLoading}
        >
          Vacuum
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleRun('reindex')}
          loading={reindexLoading}
          disabled={vacuumLoading}
        >
          Reindex
        </Button>
      </div>
      {lastResult && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Last run: <span className="font-medium text-slate-700 dark:text-slate-200">{lastResult.kind}</span>
          {' '}— {lastResult.durationMs}ms at {new Date(lastResult.completedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminMaintenance() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  return (
    <div className="flex flex-col gap-6">
      {/* Backups */}
      <Card>
        <CardContent className="pt-6">
          <BackupsSection isSuperAdmin={isSuperAdmin} />
        </CardContent>
      </Card>

      {/* SUPER_ADMIN-only: Restore from upload */}
      {isSuperAdmin && (
        <Card>
          <CardContent className="pt-6">
            <RestoreUploadSection />
          </CardContent>
        </Card>
      )}

      {/* Export */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Export</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Download a full JSON export of game history and player data.
            </p>
            <a
              href="/api/maintenance/export"
              className={cn(
                'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl',
                'font-medium transition-all duration-200 h-10 px-4 text-sm w-fit',
                'bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200',
                'border border-slate-200/80 dark:border-slate-700/80',
                'hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-sm',
              )}
              download
            >
              Download JSON export
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Schedule & retention */}
      <Card>
        <CardContent className="pt-6">
          <SettingsSection />
        </CardContent>
      </Card>

      {/* Run maintenance */}
      <Card>
        <CardContent className="pt-6">
          <RunMaintenanceSection />
        </CardContent>
      </Card>
    </div>
  );
}
