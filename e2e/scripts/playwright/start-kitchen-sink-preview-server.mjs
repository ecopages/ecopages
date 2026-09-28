/**
 * Serves a pre-built kitchen-sink dist for preview e2e. Run
 * `pnpm build:e2e:kitchen-sink` before Playwright — do not build here.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const kitchenSinkDir = path.join(repoRoot, 'playground', 'kitchen-sink');
const distDir = path.join(kitchenSinkDir, 'dist');
const ecopagesCli = path.join(repoRoot, 'packages', 'ecopages', 'bin', 'cli.js');

const runtime = process.env.ECOPAGES_PREVIEW_RUNTIME === 'node' ? 'node' : 'bun';
const port = process.env.ECOPAGES_PORT || '4008';

if (!existsSync(distDir)) {
	console.error('[kitchen-sink-preview] dist/ is missing. Run `pnpm build:e2e:kitchen-sink` before preview e2e.');
	process.exit(1);
}

const child = spawn(`node "${ecopagesCli}" preview --runtime ${runtime} --port ${port}`, {
	cwd: kitchenSinkDir,
	env: {
		...process.env,
		NODE_ENV: 'production',
		ECOPAGES_PREVIEW_SERVE_ONLY: 'true',
		ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
	},
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
