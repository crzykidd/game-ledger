/**
 * Playwright global teardown — clean up the credentials file.
 */
import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown() {
  const credsPath = path.join(__dirname, '.env.e2e.json');
  if (fs.existsSync(credsPath)) {
    fs.unlinkSync(credsPath);
  }
}

export default globalTeardown;
