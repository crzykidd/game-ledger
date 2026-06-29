/**
 * VersionBadge — subtle version indicator shown in the app footer.
 *
 * The version string is injected at build time by Vite from frontend/package.json
 * via the `__APP_VERSION__` define (see vite.config.ts). It is identical to the
 * canonical version in the root package.json because all workspace package.jsons
 * are kept in sync. The backend also exposes the same value at GET /api/version.
 */
export function VersionBadge() {
  return (
    <span
      data-testid="version-badge"
      className="text-xs text-slate-400 dark:text-slate-600 select-none"
      aria-label={`App version ${__APP_VERSION__}`}
    >
      v{__APP_VERSION__}
    </span>
  );
}
