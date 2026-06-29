/**
 * Playwright global setup.
 *
 * Resets the test DB to a known-clean state, then seeds a SUPER_ADMIN
 * via the API (once the backend webServer is ready).
 *
 * The webServer processes start BEFORE globalSetup runs (Playwright 1.46+),
 * so we can call the API directly.
 *
 * Credentials are written to e2e/.env.e2e.json so test files can read them.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://gameledger:gameledger@localhost:5432/gameledger';

const BACKEND_PORT = 3099;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

const CREDS = {
  adminEmail: 'e2e-admin@test.local',
  adminPassword: 'E2eAdmin1!XYZ',
  adminFullName: 'E2E Admin',
  adminNickname: 'e2eadmin',
};

async function truncateAll(prisma: PrismaClient) {
  // Delete in FK-safe order (children before parents).
  await prisma.gameResult.deleteMany();
  await prisma.scoreState.deleteMany();
  await prisma.gameEvent.deleteMany();
  await prisma.participation.deleteMany();
  await prisma.game.deleteMany();
  await prisma.gameModule.deleteMany();
  await prisma.token.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userPermissionOverride.deleteMany();
  await prisma.userGroup.deleteMany();
  await prisma.groupPermission.deleteMany();
  await prisma.group.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.playgroupMember.deleteMany();
  await prisma.playgroup.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();
  await prisma.globalSetting.deleteMany();
}

async function waitForBackend(maxWaitMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/setup/status`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Backend did not become ready in ${maxWaitMs}ms`);
}

async function globalSetup() {
  // 1. Truncate DB directly via Prisma (fast, no HTTP dependency).
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    await truncateAll(prisma);
    console.log('[e2e] DB truncated.');
  } finally {
    await prisma.$disconnect();
  }

  // 2. Wait for the backend webServer (started by Playwright before globalSetup in newer versions).
  //    If webServer hasn't started yet, we'll start it ourselves via playwright's request api.
  //    Actually, in Playwright, webServer starts AFTER globalSetup in versions < 1.46.
  //    We'll use a raw fetch with retry.
  await waitForBackend();
  console.log('[e2e] Backend is ready.');

  // 3. Write credentials to a JSON file for tests to read.
  //    The install wizard is intentionally NOT completed here so that the
  //    fresh-db-setup-gate.e2e.ts test can assert that / shows the wizard on a
  //    fresh DB. That test completes setup via the UI, leaving the DB in a
  //    known-seeded state for the rest of the suite.
  fs.writeFileSync(
    path.join(__dirname, '.env.e2e.json'),
    JSON.stringify(CREDS, null, 2),
  );

  console.log('[e2e] Global setup complete (DB fresh — wizard test will seed it).');
}

export default globalSetup;
