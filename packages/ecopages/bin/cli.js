#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Logger } from '@ecopages/logger';
import { createLaunchPlan, resolveEcoConfigFilePath } from './launch-plan.js';
import {
	ECOPAGES_DEV_RESTART_EXIT_CODE,
	ECOPAGES_DEV_RESTART_REASON_ENV,
	resolveDevelopmentRecoveryWatch,
} from '@ecopages/core/dev/development-restart';
import { fileSystem } from '@ecopages/file-system';
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

function getServerCommandHelpText(commandName, description, extraOptionLines = []) {
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
		'      --runtime <runtime>                 Force bun or node',
		'  -e, --entry-file <file>                 Entry file (default: app.ts)',
		'  -c, --config <file>                     Ecopages config file (default: eco.config.ts)',
		...extraOptionLines,
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
	const valueOptions = definition.valueOptions ?? {};
	const { values, positionals } = parseCommandArguments(rawArgs, {
		...sharedServerOptionDefinitions,
		...Object.fromEntries(Object.keys(valueOptions).map((option) => [option, { type: 'string' }])),
	});

	if (values.help) {
		console.log(getServerCommandHelpText(commandName, definition.description, Object.values(valueOptions)));
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
		options: {
			port: values.port,
			hostname: values.hostname,
			baseUrl: values['base-url'],
			debug: values.debug,
			runtime: values.runtime,
			configFile: values.config,
			distDir: values['dist-dir'],
		},
	};
}

/**
 * Signals the supervisor forwards to the child it runs.
 *
 * @remarks
 * Without a handler, a signal ends the supervisor and leaves the child running as an orphan that keeps its
 * port. Forwarding lets the child shut down first, and the supervisor exits from the child's `exit` event.
 */
const FORWARDED_SIGNALS = ['SIGTERM', 'SIGINT'];

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

	const forwardSignal = (signal) => {
		child.kill(signal);
	};
	for (const signal of FORWARDED_SIGNALS) {
		process.on(signal, forwardSignal);
	}

	child.on('error', (error) => {
		if (error && error.code === 'ENOENT') {
			const hint =
				launchPlan.runtime === 'bun'
					? 'Install Bun from https://bun.sh to continue.'
					: 'Reinstall Node.js or run with --runtime bun if this app needs the Bun runtime.';
			logger.error(`Command not found: ${launchPlan.command}. ${hint}`);
			process.exit(1);
		}

		logger.error(`Failed to run command: ${error.message}`);
		process.exit(1);
	});

	child.on('exit', (code) => {
		for (const signal of FORWARDED_SIGNALS) {
			process.off(signal, forwardSignal);
		}

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
 * Watches the project from before a restarted dev child launches until that child exits.
 *
 * @remarks
 * A restarted child that exits with an error keeps the supervisor alive until the next change in the
 * project or a linked workspace package, so an error in the config or a file it imports does not end
 * the dev session. The watch starts before the child, so a fix saved while it was loading relaunches
 * at once.
 * @param {string} rootDir - Project root, the directory of the resolved config
 */
async function watchProjectForRestart(rootDir) {
	const { paths, ignored } = resolveDevelopmentRecoveryWatch(rootDir);
	let changed = false;
	let onNextChange;
	const watcher = fileSystem.watch(paths, {
		ignored,
		onChange: () => {
			changed = true;
			onNextChange?.();
		},
		onError: (error) => {
			logger.error('Cannot watch the project for the next restart', error);
			process.exit(1);
		},
	});
	await watcher.ready;

	return {
		close: () => watcher.close(),
		/** Calls `relaunch` once: now if the project changed since the watch started, otherwise on the next change. */
		relaunchOnChange(relaunch) {
			const run = () => {
				onNextChange = undefined;
				void watcher.close();
				relaunch();
			};
			if (changed) {
				logger.info('The project changed since the restart. Restarting...');
				run();
				return;
			}
			logger.info('Waiting for a change in the project to restart.');
			onNextChange = run;
		},
	};
}

/**
 * Launch the entry file via the detected or forced runtime. Node and Bun get the same
 * entry file and arguments.
 * @param {string[]} args - Arguments to pass to the entry file
 * @param {object} options - CLI options (watch, runtime, port, hostname, etc.)
 * @param {string} entryFile - Entry file to run
 */
async function runEntryCommand(args, options = {}, entryFile = 'app.ts', launchMode = 'start') {
	const requiresBuiltBundle = launchMode === 'start';
	const superviseDevRestarts = launchMode === 'dev';

	if (!requiresBuiltBundle && !existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

	const projectRoot = path.dirname(resolveEcoConfigFilePath(options) ?? path.resolve('eco.config.ts'));
	const devRestartReason = 'configuration or environment change';

	const launchChild = async (restartReason) => {
		const restartWatch = restartReason ? await watchProjectForRestart(projectRoot) : undefined;
		const relaunchOnChange = () => restartWatch.relaunchOnChange(() => void launchChild(devRestartReason));
		let launchPlan;
		try {
			launchPlan = await createLaunchPlan(args, options, entryFile, launchMode);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(message);
			if (restartWatch) {
				relaunchOnChange();
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
				void restartWatch?.close();
				void launchChild(devRestartReason);
			},
			onRestartFailure: restartWatch ? relaunchOnChange : undefined,
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
		definition.entryArgs,
		{ ...parsed.options, ...definition.optionOverrides, entryFile: entry },
		entry,
		definition.launchMode ?? definition.name,
	);
}

/**
 * Commands that run an entry file, keyed by name. `launchMode` defaults to the name,
 * and `resolveEntry` replaces the app entry (`app.ts`) with another script.
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
	build: {
		description:
			'Build the project for production: pre-render the Pages in src/pages, optimize assets and images, and write the result to dist.',
		entryArgs: ['--build'],
		optionOverrides: { nodeEnv: 'production' },
	},
	start: {
		description: 'Start the production server.',
		entryArgs: [],
		optionOverrides: { nodeEnv: 'production' },
		valueOptions: {
			'dist-dir':
				'      --dist-dir <dir>                    Build output directory to start (default: the only one)',
		},
	},
	types: {
		description:
			'Load eco.config.ts so processors write the types for virtual modules such as ecopages:images, then exit. The app entry does not run. Run it before tsc.',
		entryArgs: [],
		resolveEntry: () => fileURLToPath(import.meta.resolve('@ecopages/core/config/write-types')),
		optionOverrides: { nodeEnv: 'production' },
	},
	preview: {
		description: 'Build the project for production, then serve dist locally to preview it.',
		entryArgs: ['--preview'],
		optionOverrides: { nodeEnv: 'production' },
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
