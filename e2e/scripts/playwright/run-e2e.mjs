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

function runPlaywright(args) {
	cleanupE2eTempDir();

	return new Promise((resolve, reject) => {
		const selectedProjects = getSelectedProjects(args);
		const child = spawn(process.execPath, [playwrightCliPath, 'test', ...args], {
			cwd: process.cwd(),
			env: {
				...process.env,
				...(selectedProjects.length > 0 ? { ECOPAGES_PLAYWRIGHT_PROJECTS: selectedProjects.join(',') } : {}),
			},
			stdio: 'inherit',
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			cleanupE2eTempDir();

			if (signal) {
				reject(new Error(`Playwright exited with signal ${signal}`));
				return;
			}

			resolve(code ?? 1);
		});
	});
}

export function cleanupE2eTempDir() {
	rmSync(e2eTempDir, { recursive: true, force: true });
}

async function main() {
	const forwardedArgs = process.argv.slice(2);

	if (hasInteractivePassThroughFlags(forwardedArgs)) {
		process.exitCode = await runPlaywright(forwardedArgs);
		return;
	}

	process.exitCode = await runPlaywright(forwardedArgs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
