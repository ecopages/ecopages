#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Logger } from '@ecopages/logger';
import { createLaunchPlan, resolveEcoConfigFilePath } from './launch-plan.js';
import {
	ECOPAGES_DEV_RESTART_EXIT_CODE,
	ECOPAGES_DEV_RESTART_REASON_ENV,
	getDevEnvFileNames,
} from '@ecopages/core/dev/development-restart';
import { DEVELOPMENT_RESTART_WATCH_SET_FILENAME } from '@ecopages/core/dev/development-restart-watch-paths';
import { DEFAULT_ECOPAGES_WORK_DIR } from '@ecopages/core/constants';
import { withBrandBanner } from './brand.js';

const logger = new Logger('[ecopages:cli]', { debug: process.env.ECOPAGES_LOGGER_DEBUG === 'true' });

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

const sharedServerOptionDefinitions = {
	port: {
		type: 'string',
		short: 'p',
	},
	hostname: {
		type: 'string',
		short: 'n',
	},
	'base-url': {
		type: 'string',
		short: 'b',
	},
	debug: {
		type: 'boolean',
		short: 'd',
	},
	'react-fast-refresh': {
		type: 'boolean',
		short: 'r',
	},
	runtime: {
		type: 'string',
	},
	'entry-file': {
		type: 'string',
		short: 'e',
	},
	config: {
		type: 'string',
		short: 'c',
	},
	help: {
		type: 'boolean',
		short: 'h',
	},
};

function getMainHelpText() {
	return [
		'Usage: ecopages <command> [options]',
		'',
		'Commands:',
		'  init [dir]              Initialize a new project from a template',
		'  dev                     Start the development server',
		'  dev:watch               Start the development server with watch mode',
		'  dev:hot                 Start the development server with hot reload',
		'  build                   Build the project for production',
		'  start                   Start the production server',
		'  preview                 Preview the production build',
		'  types                   Write virtual-module types for tsc, then exit',
		'',
		'Global options:',
		'  -e, --entry-file <file> Entry file (default: app.ts)',
		'  -c, --config <file>     Ecopages config file (default: eco.config.ts)',
		'  -h, --help              Show help',
		'  --version               Show version',
	].join('\n');
}

function getServerCommandHelpText(commandName, description, extraHelpLines = []) {
	return [
		`Usage: ecopages ${commandName} [options]`,
		'',
		description,
		'',
		'Options:',
		'  -p, --port <port>                       Override ECOPAGES_PORT',
		'  -n, --hostname <hostname>               Override ECOPAGES_HOSTNAME',
		'  -b, --base-url <baseUrl>                Override ECOPAGES_BASE_URL',
		'  -d, --debug                             Enable debug logging',
		'  -r, --react-fast-refresh                Enable React Fast Refresh for Bun HMR',
		'      --runtime <runtime>                 Force bun or node',
		'  -e, --entry-file <file>                 Entry file (default: app.ts)',
		'  -c, --config <file>                     Ecopages config file (default: eco.config.ts)',
		...extraHelpLines,
		'  -h, --help                              Show help',
	].join('\n');
}

function parseCommandArguments(rawArgs, options) {
	return parseArgs({
		args: rawArgs,
		options,
		allowPositionals: true,
		strict: true,
	});
}

function parseServerCommandArgs(rawArgs, definition) {
	const commandName = definition.name;
	const flags = definition.flags ?? {};
	const flagOptions = Object.fromEntries(Object.keys(flags).map((flag) => [flag, { type: 'boolean' }]));
	const { values, positionals } = parseCommandArguments(rawArgs, {
		...sharedServerOptionDefinitions,
		...flagOptions,
	});

	if (values.help) {
		console.log(getServerCommandHelpText(commandName, definition.description, Object.values(flags)));
		return { help: true };
	}

	if (positionals.length > 0) {
		throw new Error(
			`Positional entry file arguments are not supported for \`${commandName}\`. Use --entry-file <file> instead.`,
		);
	}

	const entry = values['entry-file'] ?? 'app.ts';

	return {
		entry,
		flagArgs: Object.keys(flags)
			.filter((flag) => values[flag] === true)
			.map((flag) => `--${flag}`),
		options: {
			port: values.port,
			hostname: values.hostname,
			baseUrl: values['base-url'],
			debug: values.debug,
			reactFastRefresh: values['react-fast-refresh'],
			runtime: values.runtime,
			configFile: values.config,
		},
	};
}

function runLaunchPlan(launchPlan, options = {}) {
	if (Object.keys(launchPlan.envOverrides).length > 0) {
		logger.debug(`Environment overrides: ${JSON.stringify(launchPlan.envOverrides)}`);
	}

	logger.debug(`Runtime: ${launchPlan.runtime}`);
	logger.debug(`Running: ${launchPlan.command} ${launchPlan.commandArgs.join(' ')}`);

	const child = spawn(launchPlan.command, launchPlan.commandArgs, {
		stdio: 'inherit',
		env: launchPlan.env,
	});

	child.on('error', (error) => {
		if (error && error.code === 'ENOENT') {
			const hint =
				launchPlan.runtime === 'bun'
					? 'Install Bun from https://bun.sh to continue.'
					: 'Reinstall Node.js or run with --runtime bun if this app requires Bun.';
			logger.error(`Command not found: ${launchPlan.command}. ${hint}`);
			process.exit(1);
		}

		logger.error(`Failed to run command: ${error.message}`);
		process.exit(1);
	});

	child.on('exit', (code) => {
		if (options.superviseDevRestarts && code === ECOPAGES_DEV_RESTART_EXIT_CODE) {
			options.onDevRestart?.();
			return;
		}

		if (code && options.onRestartFailure) {
			logger.error(`The restarted development server exited with code ${code}.`);
			options.onRestartFailure();
			return;
		}

		process.exit(code || 0);
	});
}

/**
 * The files whose change restarts a dev child after a failed restart.
 *
 * @remarks
 * These are the files the CLI loads: the resolved config (or the default `eco.config.ts` when none
 * exists) and the supported dotenv files in the working directory. A custom `rootDir` is not followed,
 * because the supervisor cannot read a broken config to find it.
 */
function resolveRestartWatchPaths(options) {
	return [
		resolveEcoConfigFilePath(options) ?? path.resolve('eco.config.ts'),
		...getDevEnvFileNames(options.nodeEnv).map((envFile) => path.resolve(envFile)),
	];
}

function resolveRestartWatchSet(options) {
	const fallbackFiles = resolveRestartWatchPaths(options);
	const configPath = resolveEcoConfigFilePath(options) ?? path.resolve('eco.config.ts');
	const watchSetPath = path.join(
		path.dirname(configPath),
		DEFAULT_ECOPAGES_WORK_DIR,
		DEVELOPMENT_RESTART_WATCH_SET_FILENAME,
	);

	try {
		const watchSet = JSON.parse(readFileSync(watchSetPath, 'utf8'));
		if (
			watchSet?.version !== 1 ||
			watchSet.cwd !== path.resolve(process.cwd()) ||
			!Array.isArray(watchSet.files) ||
			!watchSet.files.every((filePath) => typeof filePath === 'string' && path.isAbsolute(filePath)) ||
			!watchSet.files.includes(path.resolve(configPath)) ||
			!Array.isArray(watchSet.roots) ||
			!watchSet.roots.every((root) => typeof root === 'string' && path.isAbsolute(root)) ||
			!Array.isArray(watchSet.ignoredDirectories) ||
			!watchSet.ignoredDirectories.every(
				(directory) => typeof directory === 'string' && path.isAbsolute(directory),
			)
		) {
			return { files: fallbackFiles, roots: [], ignoredDirectories: [] };
		}

		return {
			files: [...new Set([...fallbackFiles, ...watchSet.files])],
			roots: [...new Set(watchSet.roots)],
			ignoredDirectories: [...new Set(watchSet.ignoredDirectories)],
		};
	} catch {
		return { files: fallbackFiles, roots: [], ignoredDirectories: [] };
	}
}

function isPathInside(directory, filePath) {
	const relativePath = path.relative(directory, filePath);
	return (
		relativePath === '' ||
		(relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath))
	);
}

function shouldIgnoreWorkspacePath(root, filePath, ignoredDirectories) {
	const relativePath = path.relative(root, filePath);
	if (
		relativePath
			.split(path.sep)
			.some((segment) => segment === 'node_modules' || segment === '.git' || segment.startsWith('.'))
	) {
		return true;
	}

	return ignoredDirectories.some((directory) => isPathInside(directory, filePath));
}

function fileWatchSnapshot(filePath, isDirectory = false) {
	try {
		if (isDirectory) {
			statSync(filePath);
			return 'directory';
		}

		const stats = statSync(filePath);
		return `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`;
	} catch {
		return 'missing';
	}
}

function readWorkspaceRootSnapshot(root, ignoredDirectories, snapshot) {
	const pendingDirectories = [root];

	while (pendingDirectories.length > 0) {
		const directory = pendingDirectories.pop();
		if (!directory) continue;
		snapshot.set(directory, fileWatchSnapshot(directory, true));

		let entries;
		try {
			entries = readdirSync(directory, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const entryPath = path.join(directory, entry.name);
			if (shouldIgnoreWorkspacePath(root, entryPath, ignoredDirectories) || entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				snapshot.set(entryPath, fileWatchSnapshot(entryPath, true));
				pendingDirectories.push(entryPath);
			} else {
				snapshot.set(entryPath, fileWatchSnapshot(entryPath));
			}
		}
	}

	return snapshot;
}

function readRestartWatchSnapshot(watchSet) {
	const paths = new Map(watchSet.files.map((filePath) => [filePath, fileWatchSnapshot(filePath)]));
	for (const root of watchSet.roots) readWorkspaceRootSnapshot(root, watchSet.ignoredDirectories, paths);
	return {
		paths,
		files: watchSet.files,
		roots: watchSet.roots,
		ignoredDirectories: watchSet.ignoredDirectories,
	};
}

function restartWatchSnapshotChanged(current, previous) {
	for (const [filePath, previousState] of previous.paths) {
		if (current.paths.get(filePath) !== previousState) return true;
	}

	for (const filePath of current.paths.keys()) {
		if (previous.paths.has(filePath)) continue;
		if (previous.roots.some((root) => isPathInside(root, filePath))) return true;
	}

	return false;
}

/**
 * Calls `onChange` once, on the first change to a restart file or workspace package, and closes the watchers before it.
 *
 * @remarks
 * Watches file parents so dotenv files created later and atomic file replacements are seen. Workspace
 * roots are watched recursively, matching the Project Watcher's linked-package subscription.
 */
function watchForNextChange(watchSet, onChange) {
	const watchers = [];
	let settled = false;
	const filesByDirectory = new Map();

	for (const filePath of watchSet.files) {
		const directory = path.dirname(filePath);
		const directoryFiles = filesByDirectory.get(directory) ?? new Set();
		directoryFiles.add(filePath);
		filesByDirectory.set(directory, directoryFiles);
	}

	const settle = (callback) => {
		if (settled) return;
		settled = true;
		for (const watcher of watchers) watcher.close();
		callback();
	};

	const fail = (error) => {
		settle(() => {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`Cannot watch the development restart inputs: ${message}`);
			process.exit(1);
		});
	};

	try {
		for (const [dir, filePaths] of filesByDirectory) {
			const watcher = watch(dir, (_event, fileName) => {
				if (!fileName || filePaths.has(path.resolve(dir, String(fileName)))) settle(onChange);
			});
			watchers.push(watcher);
			watcher.on('error', fail);
		}

		for (const root of watchSet.roots) {
			if (!existsSync(root)) {
				const parent = path.dirname(root);
				const rootName = path.basename(root);
				const watcher = watch(parent, (_event, fileName) => {
					if (!fileName || String(fileName) === rootName) settle(onChange);
				});
				watchers.push(watcher);
				watcher.on('error', fail);
				continue;
			}

			const watcher = watch(root, { recursive: true }, (_event, fileName) => {
				if (!fileName) {
					settle(onChange);
					return;
				}

				const changedPath = path.resolve(root, String(fileName));
				if (!shouldIgnoreWorkspacePath(root, changedPath, watchSet.ignoredDirectories)) settle(onChange);
			});
			watchers.push(watcher);
			watcher.on('error', fail);
		}
	} catch (error) {
		fail(error);
	}
}

/**
 * Launch the entry file via the detected or forced runtime.
 * Node uses native Node semantics; Bun uses Bun runtime flags.
 * @param {string[]} args - Arguments to pass to the entry file
 * @param {object} options - CLI options (watch, hot, port, hostname, etc.)
 * @param {string} entryFile - Entry file to run
 */
async function runEntryCommand(args, options = {}, entryFile = 'app.ts', launchMode = 'start') {
	const requiresBuiltBundle = launchMode === 'start';
	const superviseDevRestarts = launchMode === 'dev';

	if (!requiresBuiltBundle && !existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

	let restartWatchSet = superviseDevRestarts
		? resolveRestartWatchSet(options)
		: { files: [], roots: [], ignoredDirectories: [] };
	const devRestartReason = 'configuration or environment change';

	/**
	 * @remarks
	 * A restarted child that exits with an error keeps the supervisor alive until the next config or
	 * dotenv change, so a typo in `eco.config.ts` does not end the dev session. A change saved since
	 * that child was launched relaunches at once, because the watchers start only after it exits.
	 * Signals still end the supervisor.
	 */
	const handleRestartFailure = (restartSnapshotAtLaunch) => {
		restartWatchSet = resolveRestartWatchSet(options);
		const currentSnapshot = readRestartWatchSnapshot({
			files: restartSnapshotAtLaunch.files,
			roots: restartSnapshotAtLaunch.roots,
			ignoredDirectories: restartSnapshotAtLaunch.ignoredDirectories,
		});
		if (restartWatchSnapshotChanged(currentSnapshot, restartSnapshotAtLaunch)) {
			logger.info('A development restart input changed while the child was loading. Restarting...');
			void launchChild(devRestartReason);
			return;
		}

		logger.info('Waiting for a config, dotenv, or linked package change to restart.');
		watchForNextChange(restartWatchSet, () => {
			void launchChild(devRestartReason);
		});
	};

	const launchChild = async (restartReason) => {
		if (restartReason) restartWatchSet = resolveRestartWatchSet(options);
		const restartSnapshotAtLaunch = restartReason ? readRestartWatchSnapshot(restartWatchSet) : undefined;
		let launchPlan;
		try {
			launchPlan = await createLaunchPlan(args, options, entryFile, launchMode);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(message);
			if (restartSnapshotAtLaunch) {
				handleRestartFailure(restartSnapshotAtLaunch);
				return;
			}
			process.exit(1);
		}

		if (restartReason) {
			launchPlan.env[ECOPAGES_DEV_RESTART_REASON_ENV] = restartReason;
			launchPlan.envOverrides[ECOPAGES_DEV_RESTART_REASON_ENV] = restartReason;
		}

		runLaunchPlan(launchPlan, {
			superviseDevRestarts,
			onDevRestart: () => {
				void launchChild(devRestartReason);
			},
			onRestartFailure: restartSnapshotAtLaunch ? () => handleRestartFailure(restartSnapshotAtLaunch) : undefined,
		});
	};

	await launchChild();
}

async function runServerCommand(rawArgs, definition) {
	const parsed = parseServerCommandArgs(rawArgs, definition);

	if (parsed.help) {
		return;
	}

	const entry = definition.resolveEntry?.() ?? parsed.entry;
	await runEntryCommand(
		[...definition.entryArgs, ...parsed.flagArgs],
		{ ...parsed.options, ...definition.optionOverrides, entryFile: entry },
		entry,
		definition.launchMode ?? definition.name,
	);
}

/**
 * Commands that run an entry file, keyed by name. `launchMode` defaults to the name,
 * `resolveEntry` replaces the app entry (`app.ts`) with another script, and `flags` declares
 * boolean options that are forwarded to the entry as `--<flag>`, keyed by name with their help line.
 */
const SERVER_COMMANDS = {
	dev: {
		description: 'Start the development server.',
		entryArgs: ['--dev'],
		launchMode: 'dev',
		optionOverrides: { nodeEnv: 'development' },
	},
	'dev:watch': {
		description: 'Start the development server with watch mode.',
		entryArgs: ['--dev'],
		launchMode: 'dev',
		optionOverrides: { watch: true, nodeEnv: 'development' },
	},
	'dev:hot': {
		description: 'Start the development server with hot reload.',
		entryArgs: ['--dev'],
		launchMode: 'dev',
		optionOverrides: { hot: true, nodeEnv: 'development' },
	},
	build: {
		description: 'Build the project for production.',
		entryArgs: ['--build'],
		optionOverrides: { nodeEnv: 'production' },
		flags: {
			force: '      --force                             Empty dist and the build caches, then rebuild everything',
		},
	},
	start: {
		description: 'Start the production server.',
		entryArgs: [],
		optionOverrides: { nodeEnv: 'production' },
	},
	types: {
		description:
			'Load eco.config.ts so processors write the types for virtual modules such as ecopages:images, then exit. The app entry does not run. Run it before tsc.',
		entryArgs: [],
		resolveEntry: () => fileURLToPath(import.meta.resolve('@ecopages/core/config/write-types')),
		optionOverrides: { nodeEnv: 'production' },
	},
	preview: {
		description: 'Preview the production build.',
		entryArgs: ['--preview'],
		optionOverrides: { nodeEnv: 'production' },
		flags: {
			force: '      --force                             Empty dist and the build caches, then rebuild everything',
		},
	},
};

export async function runCli(rawArgs = process.argv.slice(2)) {
	const [commandName, ...commandArgs] = rawArgs;

	if (!commandName || commandName === '--help' || commandName === '-h') {
		console.log(withBrandBanner(pkg.version, getMainHelpText()));
		return;
	}

	if (commandName === '--version') {
		console.log(pkg.version);
		return;
	}

	try {
		const serverCommand = Object.hasOwn(SERVER_COMMANDS, commandName) ? SERVER_COMMANDS[commandName] : undefined;
		if (serverCommand) {
			await runServerCommand(commandArgs, { name: commandName, ...serverCommand });
			return;
		}

		switch (commandName) {
			case 'init': {
				const { runInitCommand } = await import('./init.js');
				await runInitCommand(commandArgs, logger);
				return;
			}
			default:
				throw new Error(`Unknown command \`${commandName}\`.`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(message);
		process.exit(1);
	}
}

if (!process.env.VITEST) {
	runCli();
}
