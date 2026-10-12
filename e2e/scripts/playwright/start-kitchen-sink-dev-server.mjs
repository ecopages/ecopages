/**
 * Starts kitchen-sink dev from the repo tree (no .e2e-tmp copy).
 *
 * Env:
 * - ECOPAGES_PORT
 * - ECOPAGES_DEV_RUNTIME=bun|node
 * - ECOPAGES_E2E_ARTIFACT_SCOPE
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const kitchenSinkDir = path.join(repoRoot, 'playground', 'kitchen-sink');
const ecopagesCli = path.join(repoRoot, 'packages', 'ecopages', 'bin', 'cli.js');

const runtime = process.env.ECOPAGES_DEV_RUNTIME === 'bun' ? 'bun' : 'node';
const port = process.env.ECOPAGES_PORT || '4007';
const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim() || 'cross-integration-dev';

const sharedEnv = {
	...process.env,
	NODE_ENV: 'development',
	ECOPAGES_E2E_ARTIFACT_SCOPE: artifactScope,
	ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
};

const command = `node "${ecopagesCli}" dev --runtime ${runtime} --port ${port}`;

const child = spawn(command, {
	cwd: kitchenSinkDir,
	env: sharedEnv,
	stdio: 'inherit',
	shell: true,
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.exit(1);
		return;
	}

	process.exit(code ?? 1);
});
