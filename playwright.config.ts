import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const E2E_BACKEND_PORT = 3099;
const E2E_FRONTEND_PORT = 5174;
const DB_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://gameledger:gameledger@localhost:5432/gameledger';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],

  globalSetup: path.resolve(__dirname, 'e2e/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, 'e2e/global-teardown.ts'),

  use: {
    baseURL: `http://localhost:${E2E_FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  webServer: [
    {
      // Backend: compiled NestJS dist on e2e-specific port.
      command: `node ${path.resolve(__dirname, 'backend/dist/main.js')}`,
      port: E2E_BACKEND_PORT,
      timeout: 20_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: DB_URL,
        SESSION_SECRET: 'e2e-session-secret-fixed',
        PORT: String(E2E_BACKEND_PORT),
        NODE_ENV: 'test',
        MODULES_DIR: path.resolve(__dirname, 'modules'),
      },
    },
    {
      // Frontend: vite preview with proxy pointed at e2e backend.
      command: `pnpm --filter frontend exec vite preview --port ${E2E_FRONTEND_PORT} --strictPort`,
      port: E2E_FRONTEND_PORT,
      timeout: 15_000,
      reuseExistingServer: false,
      env: {
        VITE_API_TARGET: `http://localhost:${E2E_BACKEND_PORT}`,
      },
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
