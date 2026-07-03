/**
 * Run one Playwright process for several projects. Sets ECOPAGES_PLAYWRIGHT_PROJECTS
 * so playwright.config.ts only boots matching webServers (not the full matrix).
 *
 * Usage:
 *   node e2e/scripts/playwright/run-playwright-batch.mjs proj-a proj-b
 *   node e2e/scripts/playwright/run-playwright-batch.mjs --grep '@stress' proj-a
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlaywrightSubprocessEnv } from '../../playwright/playwright-color-env.mjs';

const require = createRequire(import.meta.url);
const playwrightCliPath = require.resolve('@playwright/test/cli');

const args = process.argv.slice(2);
const playwrightArgs = [];
const projects = [];

for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg === '--grep') {
		playwrightArgs.push('--grep', args[index + 1] ?? '');
		index += 1;
		continue;
	}

	projects.push(arg);
}

if (projects.length === 0) {
	console.error('run-playwright-batch: pass at least one Playwright project name');
	process.exit(1);
}

const projectArgs = projects.flatMap((project) => ['--project', project]);
const result = spawnSync(process.execPath, [playwrightCliPath, 'test', ...playwrightArgs, ...projectArgs], {
	cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
	env: createPlaywrightSubprocessEnv({
		ECOPAGES_PLAYWRIGHT_PROJECTS: projects.join(','),
	}),
	stdio: 'inherit',
});

process.exit(result.status ?? 1);
