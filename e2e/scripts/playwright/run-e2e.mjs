import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
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
const maxBatchConcurrency = Math.max(1, availableParallelism());

function resolveBatchConcurrency(envName, fallback) {
	const configured = Number(process.env[envName]);
	if (Number.isInteger(configured) && configured > 0) {
		return Math.min(configured, maxBatchConcurrency);
	}

	return Math.min(fallback, maxBatchConcurrency);
}

function resolveServerConcurrency() {
	return resolveBatchConcurrency('ECOPAGES_E2E_SERVER_CONCURRENCY', maxBatchConcurrency);
}

const maxServerConcurrency = resolveServerConcurrency();
const kitchenSinkPreviewConcurrency = maxServerConcurrency;
const kitchenSinkDevConcurrency = resolveBatchConcurrency(
	'ECOPAGES_E2E_DEV_CONCURRENCY',
	Math.min(2, maxServerConcurrency),
);
const kitchenSinkHmrConcurrency = resolveBatchConcurrency('ECOPAGES_E2E_HMR_CONCURRENCY', 1);
const e2eTimingEnabled = process.env.ECOPAGES_E2E_TIMING === 'true';
const e2eTimingEntries = [];

/** Read-only kitchen-sink dev/preview projects share one copied workspace; HMR keeps isolated copies. */
export const kitchenSinkSharedWorkspace = 'kitchen-sink-shared';

/** @param {string} projectName */
export function getKitchenSinkWorkspaceForProject(projectName) {
	if (!projectName.startsWith('kitchen-sink-')) {
		throw new Error(`Not a kitchen-sink project: ${projectName}`);
	}

	if (projectName.endsWith('-hmr-e2e')) {
		return projectName.replace(/-hmr-e2e$/, '-hmr');
	}

	if (projectName.endsWith('-preview-e2e') || projectName.endsWith('-e2e')) {
		return kitchenSinkSharedWorkspace;
	}

	throw new Error(`Unrecognized kitchen-sink project name: ${projectName}`);
}

export function getKitchenSinkProjectWorkspaces(groups = kitchenSinkCapabilityGroups) {
	/** @type {Record<string, string>} */
	const workspaces = {};

	for (const group of groups) {
		for (const project of group.projects) {
			workspaces[project] = getKitchenSinkWorkspaceForProject(project);
		}
	}

	return workspaces;
}

export function assertKitchenSinkWorkspaceIsolation(groups = kitchenSinkCapabilityGroups) {
	const workspaces = getKitchenSinkProjectWorkspaces(groups);
	const hmrWorkspaceOwners = new Map();

	for (const [project, workspace] of Object.entries(workspaces)) {
		if (!project.includes('-hmr-')) {
			continue;
		}

		const owner = hmrWorkspaceOwners.get(workspace);
		if (owner) {
			throw new Error(`Kitchen-sink HMR workspace collision: ${owner} and ${project} both use ${workspace}`);
		}

		hmrWorkspaceOwners.set(workspace, project);
	}

	return workspaces;
}

function logE2eTiming(phase, projects, durationMs) {
	if (!e2eTimingEnabled) {
		return;
	}

	const entry = {
		phase,
		projects,
		durationMs,
	};
	e2eTimingEntries.push(entry);
	console.log(`[e2e-timing] ${phase} ${projects.join(', ')} ${durationMs}ms`);
}

export function getE2eTimingEntries() {
	return [...e2eTimingEntries];
}

export function resetE2eTimingEntries() {
	e2eTimingEntries.length = 0;
}

/** Playwright project batches for fixture apps (run in parallel). */
export const fixtureProjectBatches = [
	['core-e2e', 'core-postcss-e2e', 'browser-router-e2e'],
	['docs-e2e'],
	[
		'react-router-e2e',
		'react-router-persist-layouts-e2e',
		'react-router-persist-layouts-dev-e2e',
		'cache-e2e',
		'react-playground-e2e',
	],
];

/** Kitchen-sink projects grouped by capability; each project runs as its own Playwright process. */
export const kitchenSinkCapabilityGroups = [
	{
		name: 'kitchen-sink-preview',
		projects: ['kitchen-sink-bun-preview-e2e', 'kitchen-sink-node-preview-e2e'],
		concurrency: kitchenSinkPreviewConcurrency,
	},
	{
		name: 'kitchen-sink-dev',
		projects: [
			'kitchen-sink-bun-e2e',
			'kitchen-sink-node-e2e',
			'kitchen-sink-vite-node-e2e',
			'kitchen-sink-vite-bun-e2e',
		],
		concurrency: kitchenSinkDevConcurrency,
	},
	{
		name: 'kitchen-sink-hmr',
		projects: [
			'kitchen-sink-bun-hmr-e2e',
			'kitchen-sink-node-hmr-e2e',
			'kitchen-sink-vite-node-hmr-e2e',
			'kitchen-sink-vite-bun-hmr-e2e',
		],
		concurrency: kitchenSinkHmrConcurrency,
	},
];

/** @deprecated Use fixtureProjectBatches + kitchenSinkCapabilityGroups. */
export const defaultProjectBatches = [
	...fixtureProjectBatches,
	...kitchenSinkCapabilityGroups.flatMap((group) => group.projects.map((project) => [project])),
];

const interactivePassThroughFlags = new Set(['--ui']);
const batchStripFlags = new Set(['--debug']);
const kitchenSinkOnlyFlag = '--kitchen-sink-only';
const kitchenSinkCapabilityFlagPrefix = '--kitchen-sink-capability=';

const grepCapabilityGroupHints = {
	'@stress': ['kitchen-sink-dev'],
	'@content': ['kitchen-sink-dev'],
	'@realtime': ['kitchen-sink-dev'],
	'@preview': ['kitchen-sink-preview'],
	'@hmr': ['kitchen-sink-hmr'],
};

export function getGrepPattern(args) {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--grep') {
			return args[index + 1] ?? null;
		}

		if (arg.startsWith('--grep=')) {
			return arg.slice('--grep='.length);
		}
	}

	return null;
}

export function getKitchenSinkCapabilityFromArgs(args) {
	for (const arg of args) {
		if (arg.startsWith(kitchenSinkCapabilityFlagPrefix)) {
			return arg.slice(kitchenSinkCapabilityFlagPrefix.length);
		}
	}

	return null;
}

export function stripKitchenSinkCapabilityFlag(args) {
	return args.filter((arg) => !arg.startsWith(kitchenSinkCapabilityFlagPrefix));
}

export function resolveKitchenSinkCapabilityGroups(playwrightArgs, groups = kitchenSinkCapabilityGroups) {
	const capabilityFilter = getKitchenSinkCapabilityFromArgs(playwrightArgs);

	if (capabilityFilter) {
		const normalized = capabilityFilter.startsWith('kitchen-sink-')
			? capabilityFilter
			: `kitchen-sink-${capabilityFilter}`;
		const filtered = groups.filter((group) => group.name === normalized);

		if (filtered.length === 0) {
			throw new Error(`Unknown kitchen-sink capability filter: ${capabilityFilter}`);
		}

		return filtered;
	}

	const grep = getGrepPattern(playwrightArgs);
	if (grep) {
		for (const [tag, groupNames] of Object.entries(grepCapabilityGroupHints)) {
			if (grep.includes(tag)) {
				return groups.filter((group) => groupNames.includes(group.name));
			}
		}
	}

	return groups;
}

export function stripBatchIncompatibleFlags(args) {
	return args.filter((arg) => !batchStripFlags.has(arg));
}

export function stripKitchenSinkOnlyFlag(args) {
	return args.filter((arg) => arg !== kitchenSinkOnlyFlag);
}

export function stripKitchenSinkOrchestratorFlags(args) {
	return stripKitchenSinkCapabilityFlag(stripKitchenSinkOnlyFlag(stripBatchIncompatibleFlags(args)));
}

export function hasKitchenSinkOnlyFlag(args) {
	return args.includes(kitchenSinkOnlyFlag);
}

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

export function isKitchenSinkBatch(batchProjects) {
	return batchProjects.some((project) => project.startsWith('kitchen-sink-'));
}

export function partitionBatches(batches) {
	const fixtureBatches = [];
	const kitchenSinkBatches = [];

	for (const batch of batches) {
		if (isKitchenSinkBatch(batch)) {
			kitchenSinkBatches.push(batch);
			continue;
		}

		fixtureBatches.push(batch);
	}

	return { fixtureBatches, kitchenSinkBatches };
}

export function buildKitchenSinkBatches(groups = kitchenSinkCapabilityGroups) {
	return groups.flatMap((group) => group.projects.map((project) => [project]));
}

export function resolveProjectBatches(args) {
	const kitchenSinkOnly = hasKitchenSinkOnlyFlag(args);
	const playwrightArgs = stripKitchenSinkOrchestratorFlags(args);

	if (kitchenSinkOnly) {
		const groups = resolveKitchenSinkCapabilityGroups(playwrightArgs);
		return {
			batches: buildKitchenSinkBatches(groups),
			playwrightArgs,
			kitchenSinkOnly: true,
			kitchenSinkGroups: groups,
		};
	}

	return {
		batches: defaultProjectBatches,
		playwrightArgs,
		kitchenSinkOnly: false,
		kitchenSinkGroups: kitchenSinkCapabilityGroups,
	};
}

function runPlaywright(args, selectedProjects = getSelectedProjects(args), options = {}) {
	if (!options.skipCleanup) {
		cleanupE2eTempDir();
	}

	const startedAt = Date.now();
	const phase = options.phase ?? 'playwright';

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
			logE2eTiming(phase, selectedProjects, Date.now() - startedAt);

			if (signal) {
				reject(new Error(`Playwright exited with signal ${signal}`));
				return;
			}

			resolve(code ?? 1);
		});
	});
}

async function runBatchPool(args, batches, concurrency, options = {}) {
	if (batches.length === 0) {
		return 0;
	}

	let nextIndex = 0;
	let firstFailure = 0;

	async function worker() {
		while (nextIndex < batches.length) {
			if (firstFailure !== 0) {
				return;
			}

			const batchIndex = nextIndex;
			nextIndex += 1;
			const batchProjects = batches[batchIndex];
			const exitCode = await runPlaywright([...args, ...buildProjectArgs(batchProjects)], batchProjects, {
				skipCleanup: true,
				phase: options.phase ?? 'fixture-batch',
			});

			if (exitCode !== 0 && firstFailure === 0) {
				firstFailure = exitCode;
			}
		}
	}

	const workerCount = Math.min(concurrency, batches.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	return firstFailure;
}

export async function runKitchenSinkCapabilityGroups(args, groups = kitchenSinkCapabilityGroups) {
	assertKitchenSinkWorkspaceIsolation(groups);

	for (const group of groups) {
		const groupStartedAt = Date.now();
		const batches = group.projects.map((project) => [project]);
		const exitCode = await runBatchPool(args, batches, group.concurrency, { phase: group.name });

		logE2eTiming(`group-total:${group.name}`, group.projects, Date.now() - groupStartedAt);

		if (exitCode !== 0) {
			return exitCode;
		}
	}

	return 0;
}

export async function runPlaywrightInBatches(args, batches, concurrency = maxBatchConcurrency) {
	cleanupE2eTempDir();

	const { fixtureBatches, kitchenSinkBatches } = partitionBatches(batches);
	const fixtureExitCode = await runBatchPool(args, fixtureBatches, concurrency, { phase: 'fixtures' });

	if (fixtureExitCode !== 0) {
		return fixtureExitCode;
	}

	if (kitchenSinkBatches.length === 0) {
		return 0;
	}

	return runKitchenSinkCapabilityGroups(args);
}

export async function runKitchenSinkOnly(args, groups = resolveKitchenSinkCapabilityGroups(args)) {
	cleanupE2eTempDir();
	return runKitchenSinkCapabilityGroups(args, groups);
}

export function cleanupE2eTempDir() {
	rmSync(e2eTempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

async function main() {
	resetE2eTimingEntries();
	const gateStartedAt = Date.now();
	const forwardedArgs = process.argv.slice(2);
	const selectedProjects = getSelectedProjects(forwardedArgs);

	if (hasInteractivePassThroughFlags(forwardedArgs)) {
		process.exitCode = await runPlaywright(forwardedArgs, selectedProjects);
		return;
	}

	const { batches, playwrightArgs, kitchenSinkOnly, kitchenSinkGroups } = resolveProjectBatches(forwardedArgs);

	if (kitchenSinkOnly) {
		process.exitCode = await runKitchenSinkOnly(playwrightArgs, kitchenSinkGroups);
		logE2eTiming('gate-total', ['kitchen-sink-only'], Date.now() - gateStartedAt);
		return;
	}

	process.exitCode =
		selectedProjects.length > 0
			? await runPlaywright(playwrightArgs, selectedProjects)
			: await runPlaywrightInBatches(playwrightArgs, batches);

	logE2eTiming(
		'gate-total',
		selectedProjects.length > 0 ? selectedProjects : ['full-gate'],
		Date.now() - gateStartedAt,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
