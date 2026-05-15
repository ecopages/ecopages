import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const playwrightCliPath = require.resolve('@playwright/test/cli');
const e2eTempDir = path.join(repoRoot, '.e2e-tmp');
const defaultProjectBatches = [
	['core-e2e', 'core-postcss-e2e', 'browser-router-e2e'],
	['docs-e2e'],
	[
		'react-router-e2e',
		'react-router-persist-layouts-e2e',
		'react-router-persist-layouts-dev-e2e',
		'cache-e2e',
		'react-playground-e2e',
	],
	[
		'kitchen-sink-bun-e2e',
		'kitchen-sink-bun-hmr-e2e',
		'kitchen-sink-bun-preview-e2e',
		'kitchen-sink-node-e2e',
		'kitchen-sink-node-hmr-e2e',
		'kitchen-sink-node-preview-e2e',
	],
	[
		'kitchen-sink-vite-node-e2e',
		'kitchen-sink-vite-node-hmr-e2e',
		'kitchen-sink-vite-bun-e2e',
		'kitchen-sink-vite-bun-hmr-e2e',
	],
];

const interactivePassThroughFlags = new Set(['--debug', '--ui']);

export function hasInteractivePassThroughFlags(args) {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (interactivePassThroughFlags.has(arg)) {
			return true;
		}
	}

	return false;
}

export function getSelectedProjects(args) {
	const selectedProjects = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--project') {
			const value = args[index + 1];
			if (value) {
				selectedProjects.push(value);
			}
			index += 1;
			continue;
		}

		if (arg.startsWith('--project=')) {
			selectedProjects.push(arg.slice('--project='.length));
		}
	}

	return selectedProjects;
}

export function buildProjectArgs(projects) {
	return projects.flatMap((project) => ['--project', project]);
}

function runPlaywright(args, selectedProjects = getSelectedProjects(args)) {
	cleanupE2eTempDir();

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [playwrightCliPath, 'test', ...args], {
			cwd: process.cwd(),
			env: {
				...process.env,
				ECOPAGES_MANAGE_ISOLATED_WORKSPACES: 'true',
				...(selectedProjects.length > 0 ? { ECOPAGES_PLAYWRIGHT_PROJECTS: selectedProjects.join(',') } : {}),
			},
			stdio: 'inherit',
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`Playwright exited with signal ${signal}`));
				return;
			}

			resolve(code ?? 1);
		});
	});
}

async function runPlaywrightInDefaultBatches(args) {
	for (const batchProjects of defaultProjectBatches) {
		const exitCode = await runPlaywright([...args, ...buildProjectArgs(batchProjects)], batchProjects);
		if (exitCode !== 0) {
			return exitCode;
		}
	}

	return 0;
}

export function cleanupE2eTempDir() {
	rmSync(e2eTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

async function main() {
	const forwardedArgs = process.argv.slice(2);
	const selectedProjects = getSelectedProjects(forwardedArgs);

	if (hasInteractivePassThroughFlags(forwardedArgs)) {
		process.exitCode = await runPlaywright(forwardedArgs, selectedProjects);
		return;
	}

	process.exitCode =
		selectedProjects.length > 0
			? await runPlaywright(forwardedArgs, selectedProjects)
			: await runPlaywrightInDefaultBatches(forwardedArgs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
