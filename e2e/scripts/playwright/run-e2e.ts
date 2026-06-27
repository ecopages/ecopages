/**
 * Playwright batch orchestrator. Runs five sequential waves — one subprocess
 * each — covering all 14 e2e projects. Use `--project` to bypass waves and run
 * a single Playwright invocation; use `--ui` for interactive mode.
 *
 * Wave definitions live in `e2e/playwright/orchestration-waves.ts`.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configurePlaywrightColorEnv, createPlaywrightSubprocessEnv } from '../../playwright/playwright-color-env.mjs';
import { FULL_GATE_WAVES, assertWaveCoverage, type Wave } from '../../playwright/orchestration-waves.ts';

configurePlaywrightColorEnv(process.env);

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const playwrightCliPath = require.resolve('@playwright/test/cli');
const e2eTempDir = path.join(repoRoot, '.e2e-tmp');
const e2eTimingEnabled = process.env.ECOPAGES_E2E_TIMING === 'true';
const e2eTimingEntries: { phase: string; projects: string[]; durationMs: number }[] = [];

const interactivePassThroughFlags = new Set(['--ui']);
const batchStripFlags = new Set(['--debug']);

function logE2eTiming(phase: string, projects: string[], durationMs: number): void {
	if (!e2eTimingEnabled) {
		return;
	}

	e2eTimingEntries.push({ phase, projects, durationMs });
	console.log(`[e2e-timing] ${phase} ${projects.join(', ')} ${durationMs}ms`);
}

export function getE2eTimingEntries() {
	return [...e2eTimingEntries];
}

export function resetE2eTimingEntries() {
	e2eTimingEntries.length = 0;
}

export function cleanupE2eTempDir(): void {
	rmSync(e2eTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

export function getSelectedProjects(args: string[]): string[] {
	const selectedProjects: string[] = [];

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

export function buildProjectArgs(projects: string[]): string[] {
	return projects.flatMap((project) => ['--project', project]);
}

export function hasInteractivePassThroughFlags(args: string[]): boolean {
	return args.some((arg) => interactivePassThroughFlags.has(arg));
}

export function stripBatchIncompatibleFlags(args: string[]): string[] {
	return args.filter((arg) => !batchStripFlags.has(arg));
}

function runPlaywright(
	args: string[],
	selectedProjects: string[] = [],
	options: { phase?: string; skipCleanup?: boolean } = {},
): Promise<number> {
	if (!options.skipCleanup) {
		cleanupE2eTempDir();
	}

	const startedAt = Date.now();
	const phase = options.phase ?? 'playwright';

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [playwrightCliPath, 'test', ...args], {
			cwd: process.cwd(),
			env: createPlaywrightSubprocessEnv({
				ECOPAGES_MANAGE_ISOLATED_WORKSPACES: 'true',
				...(selectedProjects.length > 0 ? { ECOPAGES_PLAYWRIGHT_PROJECTS: selectedProjects.join(',') } : {}),
			}),
			stdio: 'inherit',
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			logE2eTiming(phase, selectedProjects, Date.now() - startedAt);

			if (signal) {
				reject(new Error(`Playwright exited with signal ${signal}`));
				return;
			}

			resolve(code ?? 1);
		});
	});
}

async function runWaves(args: string[], waves: Wave[]): Promise<number> {
	for (const wave of waves) {
		const exitCode = await runPlaywright([...args, ...buildProjectArgs(wave.projects)], wave.projects, {
			skipCleanup: true,
			phase: wave.name,
		});

		if (exitCode !== 0) {
			return exitCode;
		}
	}

	return 0;
}

async function main(): Promise<void> {
	resetE2eTimingEntries();
	const gateStartedAt = Date.now();
	const forwardedArgs = process.argv.slice(2);
	const selectedProjects = getSelectedProjects(forwardedArgs);

	if (hasInteractivePassThroughFlags(forwardedArgs)) {
		process.exitCode = await runPlaywright(forwardedArgs, selectedProjects);
		logE2eTiming('gate-total', selectedProjects.length > 0 ? selectedProjects : ['ui'], Date.now() - gateStartedAt);
		return;
	}

	if (selectedProjects.length > 0) {
		process.exitCode = await runPlaywright(forwardedArgs, selectedProjects);
		logE2eTiming('gate-total', selectedProjects, Date.now() - gateStartedAt);
		return;
	}

	assertWaveCoverage();
	const playwrightArgs = stripBatchIncompatibleFlags(forwardedArgs);
	process.exitCode = await runWaves(playwrightArgs, FULL_GATE_WAVES);
	logE2eTiming('gate-total', ['full-gate'], Date.now() - gateStartedAt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
