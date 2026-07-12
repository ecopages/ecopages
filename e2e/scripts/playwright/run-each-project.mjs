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
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlaywrightSubprocessEnv } from '../../playwright/playwright-color-env.mjs';
import { removeDirectorySync } from './run-isolated-app.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Isolated kitchen-sink cells copy into `.e2e-tmp/<workspace>` and may mutate source. */
const ISOLATED_PROJECT_WORKSPACES = {
	'cross-integration-hmr-e2e': 'cross-integration-hmr',
	'cross-integration-bun-parity-e2e': 'cross-integration-bun-parity',
	'cross-integration-vite-node-parity-e2e': 'cross-integration-vite-node-parity',
	'cross-integration-vite-bun-parity-e2e': 'cross-integration-vite-bun-parity',
};

function shouldResetIsolatedWorkspace() {
	return process.env.ECOPAGES_REUSE_TEST_SERVERS !== 'true';
}

function prepareIsolatedProjectWorkspace(project) {
	if (!shouldResetIsolatedWorkspace()) {
		return;
	}

	const workspace = ISOLATED_PROJECT_WORKSPACES[project];
	if (!workspace) {
		return;
	}

	const workspaceDir = path.join(repoRoot, '.e2e-tmp', workspace);
	removeDirectorySync(workspaceDir);

	try {
		unlinkSync(`${workspaceDir}.prepare-lock`);
	} catch (error) {
		if (error?.code !== 'ENOENT') {
			throw error;
		}
	}
}
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
	prepareIsolatedProjectWorkspace(project);

	const env = createPlaywrightSubprocessEnv({
		ECOPAGES_MANAGE_ISOLATED_WORKSPACES: 'true',
		ECOPAGES_PLAYWRIGHT_PROJECTS: project,
	});

	const result = spawnSync(process.execPath, [playwrightCliPath, 'test', ...playwrightArgs, '--project', project], {
		cwd: repoRoot,
		env,
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}

	prepareIsolatedProjectWorkspace(project);
}
