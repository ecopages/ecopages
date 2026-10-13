/**
 * Starts kitchen-sink dev from the repo tree (no .e2e-tmp copy).
 *
 * Env:
 * - ECOPAGES_PORT
 * - ECOPAGES_DEV_RUNTIME=bun|node
 * - ECOPAGES_E2E_ARTIFACT_SCOPE
 * - ECOPAGES_E2E_DEV_INIT_CEILING_MS: when set, log the init time and fail if the ready line takes longer
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ECOPAGES_SERVER_READY_STDOUT_REGEX } from '../../playwright/isolated-dev-server-ready.ts';
import { trackDevInit } from './dev-init-ceiling.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const kitchenSinkDir = path.join(repoRoot, 'playground', 'kitchen-sink');
const ecopagesCli = path.join(repoRoot, 'packages', 'ecopages', 'bin', 'cli.js');

const runtime = process.env.ECOPAGES_DEV_RUNTIME === 'bun' ? 'bun' : 'node';
const port = process.env.ECOPAGES_PORT || '4007';
const artifactScope = process.env.ECOPAGES_E2E_ARTIFACT_SCOPE?.trim() || 'cross-integration-dev';
const initCeilingMs = Number(process.env.ECOPAGES_E2E_DEV_INIT_CEILING_MS) || 0;

const sharedEnv = {
	...process.env,
	NODE_ENV: 'development',
	ECOPAGES_E2E_ARTIFACT_SCOPE: artifactScope,
	ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
};

const child = spawn(process.execPath, [ecopagesCli, 'dev', '--runtime', runtime, '--port', port], {
	cwd: kitchenSinkDir,
	env: sharedEnv,
	stdio: ['inherit', 'pipe', 'inherit'],
});

let exceededCeiling = false;

const initTracker =
	initCeilingMs > 0
		? trackDevInit({
				readyPattern: ECOPAGES_SERVER_READY_STDOUT_REGEX,
				ceilingMs: initCeilingMs,
				onReady: (elapsedMs) => {
					console.log(
						`[e2e-server] dev init on ${runtime}: ${(elapsedMs / 1000).toFixed(1)}s (ceiling ${initCeilingMs / 1000}s)`,
					);
				},
				onExceeded: () => {
					console.error(`[e2e-server] dev init on ${runtime} exceeded the ${initCeilingMs / 1000}s ceiling`);
					exceededCeiling = true;
					child.kill('SIGTERM');
				},
			})
		: undefined;

child.stdout.on('data', (chunk) => {
	process.stdout.write(chunk);
	initTracker?.onOutput(chunk.toString());
});

child.on('exit', (code, signal) => {
	initTracker?.dispose();

	if (signal || exceededCeiling) {
		process.exit(1);
		return;
	}

	process.exit(code ?? 1);
});
