import { spawn } from 'node:child_process';
import process from 'node:process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightCliPath = require.resolve('@playwright/test/cli');
const kitchenSinkStatefulSpec = 'playground/kitchen-sink/e2e/includes-hmr.test.e2e.ts';

const nonKitchenSinkProjects = [
	'core-e2e',
	'core-postcss-e2e',
	'browser-router-e2e',
	'docs-e2e',
	'react-router-e2e',
	'react-router-persist-layouts-e2e',
	'react-router-persist-layouts-dev-e2e',
	'cache-e2e',
	'react-playground-e2e',
];

const kitchenSinkDevProjects = [
	'kitchen-sink-bun-e2e',
	'kitchen-sink-node-e2e',
	'kitchen-sink-vite-node-e2e',
	'kitchen-sink-vite-bun-e2e',
];

const kitchenSinkViteProjects = [
	'kitchen-sink-vite-node-e2e',
	'kitchen-sink-vite-bun-e2e',
];

const kitchenSinkStableDevProjects = [
	'kitchen-sink-bun-e2e',
	'kitchen-sink-node-e2e',
];

const kitchenSinkPreviewProjects = [
	'kitchen-sink-preview-bun-e2e',
	'kitchen-sink-preview-node-e2e',
];

const allKnownProjects = [
	...nonKitchenSinkProjects,
	...kitchenSinkDevProjects,
	...kitchenSinkPreviewProjects,
];

const interactivePassThroughFlags = new Set(['--debug', '--ui']);

const optionFlagsWithValues = new Set([
	'--config',
	'-c',
	'--grep',
	'--grep-invert',
	'--only-changed',
	'--project',
	'--shard',
	'--test-list',
	'--test-list-invert',
	'-g',
	'--reporter',
]);

function isKnownProject(projectName) {
	return allKnownProjects.includes(projectName);
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

function getSelectedProjects(args) {
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

function stripProjectArgs(args) {
	const strippedArgs = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--project') {
			index += 1;
			continue;
		}

		if (arg.startsWith('--project=')) {
			continue;
		}

		strippedArgs.push(arg);
	}

	return strippedArgs;
}

function stripFileArgs(args) {
	const strippedArgs = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg.startsWith('-')) {
			strippedArgs.push(arg);

			if (optionFlagsWithValues.has(arg)) {
				const value = args[index + 1];
				if (value !== undefined) {
					strippedArgs.push(value);
				}
				index += 1;
			}
			continue;
		}
	}

	return strippedArgs;
}

export function getFileArgs(args) {
	const fileArgs = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg.startsWith('-')) {
			if (optionFlagsWithValues.has(arg)) {
				index += 1;
			}
			continue;
		}

		fileArgs.push(arg);
	}

	return fileArgs;
}

function usesStatefulKitchenSinkSpec(fileArgs) {
	return fileArgs.some((fileArg) => fileArg.includes('includes-hmr.test.e2e.ts'));
}

function isGlobPattern(value) {
	return ['*', '?', '{', '}', '[', ']'].some((token) => value.includes(token));
}

function matchesStatefulKitchenSinkSelectionPattern(fileArg) {
	return (
		fileArg.includes('playground/kitchen-sink/e2e/') &&
		fileArg.includes('.test.e2e.ts') &&
		!fileArg.includes('.preview.test.e2e.ts') &&
		isGlobPattern(fileArg)
	);
}

function isStatefulKitchenSinkSpecOnlySelection(fileArgs) {
	return fileArgs.length > 0 && fileArgs.every((fileArg) => fileArg.includes('includes-hmr.test.e2e.ts'));
}

function shouldAppendStatefulKitchenSinkRuns(fileArgs) {
	if (fileArgs.length === 0) {
		return true;
	}

	return fileArgs.some((fileArg) => matchesStatefulKitchenSinkSelectionPattern(fileArg));
}

function getTargetProjects(selectedProjects) {
	if (selectedProjects.length > 0) {
		return selectedProjects.filter((projectName) => isKnownProject(projectName));
	}

	return allKnownProjects;
}

function inferProjectsFromFiles(fileArgs) {
	if (fileArgs.length === 0) {
		return null;
	}

	if (fileArgs.every((fileArg) => fileArg.includes('playground/kitchen-sink/e2e/'))) {
		return [...kitchenSinkDevProjects, ...kitchenSinkPreviewProjects];
	}

	return null;
}

function filterProjects(projects, targetProjects) {
	const targetSet = new Set(targetProjects);
	return projects.filter((projectName) => targetSet.has(projectName));
}

function buildParallelRun(projects, forwardedArgs) {
	if (projects.length === 0) {
		return null;
	}

	return [
		...forwardedArgs,
		...projects.flatMap((projectName) => ['--project', projectName]),
	];
}

function buildSerialRuns(projects, forwardedArgs, env) {
	return projects.map((projectName) => ({
		args: [...forwardedArgs, '--project', projectName],
		env,
	}));
}

function buildStatefulKitchenSinkRuns(projects, forwardedArgs) {
	return buildSerialRuns(projects, [kitchenSinkStatefulSpec, ...stripFileArgs(forwardedArgs)], {
		ECOPAGES_INCLUDE_STATEFUL_KITCHEN_SINK_TESTS: 'true',
	});
}

export function buildProjectRuns(args) {
	const selectedProjects = getSelectedProjects(args);
	const forwardedArgs = stripProjectArgs(args);
	const fileArgs = getFileArgs(forwardedArgs);
	const targetProjects =
		selectedProjects.length > 0 ? getTargetProjects(selectedProjects) : (inferProjectsFromFiles(fileArgs) ?? allKnownProjects);
	const projectRuns = [];
	const statefulSpecOnly = isStatefulKitchenSinkSpecOnlySelection(fileArgs);

	if (statefulSpecOnly) {
		const statefulProjects = filterProjects(kitchenSinkDevProjects, targetProjects);
		return buildStatefulKitchenSinkRuns(statefulProjects, forwardedArgs);
	}

	const nonKitchenSinkRun = buildParallelRun(filterProjects(nonKitchenSinkProjects, targetProjects), forwardedArgs);
	if (nonKitchenSinkRun) {
		projectRuns.push({ args: nonKitchenSinkRun });
	}

	const stableKitchenSinkRun = buildParallelRun(filterProjects(kitchenSinkStableDevProjects, targetProjects), forwardedArgs);
	if (stableKitchenSinkRun) {
		projectRuns.push({ args: stableKitchenSinkRun });
	}

	projectRuns.push(
		...buildSerialRuns(filterProjects(kitchenSinkViteProjects, targetProjects), forwardedArgs),
	);

	const previewKitchenSinkRun = buildParallelRun(filterProjects(kitchenSinkPreviewProjects, targetProjects), forwardedArgs);
	if (previewKitchenSinkRun) {
		projectRuns.push({ args: previewKitchenSinkRun });
	}

	if (shouldAppendStatefulKitchenSinkRuns(fileArgs)) {
		projectRuns.push(
			...buildStatefulKitchenSinkRuns(filterProjects(kitchenSinkDevProjects, targetProjects), forwardedArgs),
		);
	}

	return projectRuns;
}

function getPassThroughEnv(args) {
	const fileArgs = getFileArgs(stripProjectArgs(args));

	if (!usesStatefulKitchenSinkSpec(fileArgs)) {
		return undefined;
	}

	return {
		ECOPAGES_INCLUDE_STATEFUL_KITCHEN_SINK_TESTS: 'true',
	};
}

function runPlaywright(args, env = {}) {
	return new Promise((resolve, reject) => {
		const selectedProjects = getSelectedProjects(args);
		const child = spawn(process.execPath, [playwrightCliPath, 'test', ...args], {
			cwd: process.cwd(),
			env: {
				...process.env,
				...(selectedProjects.length > 0
					? { ECOPAGES_PLAYWRIGHT_PROJECTS: selectedProjects.join(',') }
					: {}),
				...env,
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

async function main() {
	const forwardedArgs = process.argv.slice(2);
	const selectedProjects = getSelectedProjects(forwardedArgs);

	if (hasInteractivePassThroughFlags(forwardedArgs)) {
		process.exitCode = await runPlaywright(forwardedArgs, getPassThroughEnv(forwardedArgs));
		return;
	}

	if (selectedProjects.some((projectName) => !isKnownProject(projectName))) {
		process.exitCode = await runPlaywright(forwardedArgs);
		return;
	}

	const projectRuns = buildProjectRuns(forwardedArgs);

	for (const run of projectRuns) {
		const exitCode = await runPlaywright(run.args, run.env);
		if (exitCode !== 0) {
			process.exitCode = exitCode;
			return;
		}
	}

	process.exitCode = 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}