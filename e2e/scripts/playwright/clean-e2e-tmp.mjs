import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const e2eTempDir = path.join(repoRoot, '.e2e-tmp');

rmSync(e2eTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
