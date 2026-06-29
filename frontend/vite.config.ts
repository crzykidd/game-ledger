/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Read the version from the canonical source (frontend/package.json) at build/test time.
// This keeps the single source of truth without a second runtime lookup.
const { version: APP_VERSION } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point to TS source so Vite bundles it as ESM (avoids CJS interop issues)
      '@game-ledger/contract': resolve(__dirname, '../packages/contract/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // When running behind the dev nginx ingress, HMR must connect back through
    // the ingress port (DEV_APP_PORT, default 8088) — not Vite's internal 5173.
    // The nginx dev config proxies websocket upgrades on / through to frontend:5173,
    // so all HMR traffic flows through nginx at the single public port.
    hmr: process.env.VITE_HMR_CLIENT_PORT
      ? { clientPort: parseInt(process.env.VITE_HMR_CLIENT_PORT, 10) }
      : {},
    // Allow any host by default (dev server sits behind the nginx ingress and is
    // reached via the homelab FQDN, not just localhost). Restrict with a
    // comma-separated VITE_ALLOWED_HOSTS if desired. NB: Vite wants `true` or a
    // string[] here — the literal string 'all' is NOT a wildcard.
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim())
      : true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    // Injected at build/test time from frontend/package.json so the frontend has
    // a single canonical version string without a second runtime API call.
    // Declare in src/vite-env.d.ts: declare const __APP_VERSION__: string;
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
