import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const runE2eScriptPath = path.join(scriptDir, 'run-e2e.mjs');
const playwrightConfigPath = path.join(repoRoot, 'playwright.config.ts');

const projectGroups = {
	all: [
		'kitchen-sink-bun-e2e',
		'kitchen-sink-node-e2e',
		'kitchen-sink-vite-node-e2e',
		'kitchen-sink-vite-bun-e2e',
		'kitchen-sink-bun-hmr-e2e',
		'kitchen-sink-node-hmr-e2e',
		'kitchen-sink-vite-node-hmr-e2e',
		'kitchen-sink-vite-bun-hmr-e2e',
		'kitchen-sink-bun-preview-e2e',
		'kitchen-sink-node-preview-e2e',
	],
	dev: [
		'kitchen-sink-bun-e2e',
		'kitchen-sink-node-e2e',
		'kitchen-sink-vite-node-e2e',
		'kitchen-sink-vite-bun-e2e',
		'kitchen-sink-bun-hmr-e2e',
		'kitchen-sink-node-hmr-e2e',
		'kitchen-sink-vite-node-hmr-e2e',
		'kitchen-sink-vite-bun-hmr-e2e',
	],
	preview: ['kitchen-sink-bun-preview-e2e', 'kitchen-sink-node-preview-e2e'],
};

const optionFlagsWithValues = new Set([
	'--config',
	'-c',
	'--grep',
	'--grep-invert',
	'--only-changed',
	'--project',
	'--reporter',
	'--shard',
	'--test-list',
	'--test-list-invert',
	'-g',
]);

function stripLeadingSeparator(args) {
	if (args[0] === '--') {
		return args.slice(1);
	}

	return args;
}

export function parseArgs(args) {
	const [firstArg, ...restArgs] = args;

	if (!firstArg || firstArg.startsWith('-')) {
		return {
			group: 'all',
			forwardedArgs: stripLeadingSeparator(args),
		};
	}

	if (Object.hasOwn(projectGroups, firstArg)) {
		return {
			group: firstArg,
			forwardedArgs: stripLeadingSeparator(restArgs),
		};
	}

	return {
		group: 'all',
		forwardedArgs: stripLeadingSeparator(args),
	};
}

export function buildPlaywrightArgs(group, forwardedArgs) {
	const selectorArgs = [];
	const optionArgs = [];

	for (let index = 0; index < forwardedArgs.length; index += 1) {
		const arg = forwardedArgs[index];

		if (arg.startsWith('-')) {
			optionArgs.push(arg);

			if (optionFlagsWithValues.has(arg)) {
				const value = forwardedArgs[index + 1];
				if (value !== undefined) {
					optionArgs.push(value);
				}
				index += 1;
			}

			continue;
		}

		selectorArgs.push(arg);
	}

	return [
		'--config',
		playwrightConfigPath,
		...selectorArgs,
		...projectGroups[group].flatMap((projectName) => ['--project', projectName]),
		...optionArgs,
	];
}

async function main() {
	const { group, forwardedArgs } = parseArgs(process.argv.slice(2));
	const child = spawn(process.execPath, [runE2eScriptPath, ...buildPlaywrightArgs(group, forwardedArgs)], {
		cwd: process.cwd(),
		stdio: 'inherit',
	});

	await new Promise((resolve, reject) => {
		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`Kitchen sink e2e runner exited with signal ${signal}`));
				return;
			}

			process.exitCode = code ?? 1;
			resolve(undefined);
		});
	});
}

await main();
