/**
 * Run `playwright test --project <name>` once per project. Use when those servers
 * must not boot in the same Playwright process.
 *
 * Usage:
 *   node e2e/scripts/playwright/run-each-project.mjs proj-a proj-b
 *   node e2e/scripts/playwright/run-each-project.mjs --grep '@parity' proj-a
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
	console.error('run-each-project: pass at least one Playwright project name');
	process.exit(1);
}

for (const project of projects) {
	const env = createPlaywrightSubprocessEnv({
		ECOPAGES_MANAGE_ISOLATED_WORKSPACES: 'true',
		ECOPAGES_PLAYWRIGHT_PROJECTS: project,
	});

	const result = spawnSync(process.execPath, [playwrightCliPath, 'test', ...playwrightArgs, '--project', project], {
		cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
		env,
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
