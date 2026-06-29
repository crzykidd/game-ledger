import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Reads the application version from the backend's own package.json at
 * runtime. This file is always present in both production (copied by the
 * Dockerfile) and local development environments.
 *
 * Resolution order (first match wins):
 *   1. <__dirname>/../package.json  — production: /app/backend/dist/../package.json
 *   2. <__dirname>/../../package.json — ts-jest: backend/src/version/../../package.json
 */
function readVersionFromPackageJson(): string {
  const candidates = [
    join(__dirname, '..', 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf-8');
      const pkg: unknown = JSON.parse(raw);
      if (
        typeof pkg === 'object' &&
        pkg !== null &&
        'version' in pkg &&
        typeof (pkg as { version: unknown }).version === 'string'
      ) {
        const ver = (pkg as { version: string }).version;
        if (/^\d+\.\d+\.\d+/.test(ver)) return ver;
      }
    } catch {
      // try next candidate
    }
  }
  return 'unknown';
}

@Injectable()
export class VersionService {
  private readonly version: string;

  constructor() {
    this.version = readVersionFromPackageJson();
  }

  getVersion(): string {
    return this.version;
  }
}
