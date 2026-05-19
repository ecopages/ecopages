#!/usr/bin/env node

import { downloadTemplate } from 'giget';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@ecopages/logger';
import { createLaunchPlan } from './launch-plan.js';

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
	help: {
		type: 'boolean',
		short: 'h',
	},
};

const initOptionDefinitions = {
	template: {
		type: 'string',
	},
	repo: {
		type: 'string',
	},
	help: {
		type: 'boolean',
		short: 'h',
	},
};

function getMainHelpText() {
	return [
		`ecopages ${pkg.version}`,
		'',
		'Usage: ecopages <command> [options]',
		'',
		'Commands:',
		'  init <dir>              Initialize a new project from a template',
		'  dev [entry]             Start the development server',
		'  dev:watch [entry]       Start the development server with watch mode',
		'  dev:hot [entry]         Start the development server with hot reload',
		'  build [entry]           Build the project for production',
		'  start [entry]           Start the production server',
		'  preview [entry]         Preview the production build',
		'',
		'Global options:',
		'  -h, --help              Show help',
		'  --version               Show version',
	].join('\n');
}

function getServerCommandHelpText(commandName, description) {
	return [
		`Usage: ecopages ${commandName} [entry] [options]`,
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
		'  -h, --help                              Show help',
	].join('\n');
}

function getBuildCommandHelpText() {
	return [
		'Usage: ecopages build [entry] [options]',
		'',
		'Build the project for production.',
		'',
		'Options:',
		'  -p, --port <port>                       Override ECOPAGES_PORT',
		'  -n, --hostname <hostname>               Override ECOPAGES_HOSTNAME',
		'  -b, --base-url <baseUrl>                Override ECOPAGES_BASE_URL',
		'  -d, --debug                             Enable debug logging',
		'  -r, --react-fast-refresh                Enable React Fast Refresh for Bun HMR',
		'      --runtime <runtime>                 Force bun or node',
		'  -h, --help                              Show help',
	].join('\n');
}

function getInitCommandHelpText() {
	return [
		'Usage: ecopages init <dir> [options]',
		'',
		'Initialize a new project from a template.',
		'',
		'Options:',
		'      --template <template>               Template name from ecopages/examples/',
		'      --repo <repo>                       GitHub repo in user/repo form',
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

function parseServerCommandArgs(rawArgs, commandName, description, mode = 'server') {
	const { values, positionals } = parseCommandArguments(rawArgs, sharedServerOptionDefinitions);

	if (values.help) {
		console.log(mode === 'build' ? getBuildCommandHelpText() : getServerCommandHelpText(commandName, description));
		return { help: true };
	}

	if (positionals.length > 1) {
		throw new Error(`Too many positional arguments provided for \`${commandName}\`.`);
	}

	return {
		entry: positionals[0] ?? 'app.ts',
		options: {
			port: values.port,
			hostname: values.hostname,
			baseUrl: values['base-url'],
			debug: values.debug,
			reactFastRefresh: values['react-fast-refresh'],
			runtime: values.runtime,
		},
	};
}

function parseInitCommandArgs(rawArgs) {
	const { values, positionals } = parseCommandArguments(rawArgs, initOptionDefinitions);

	if (values.help) {
		console.log(getInitCommandHelpText());
		return { help: true };
	}

	if (positionals.length !== 1) {
		throw new Error('The `init` command requires exactly one target directory argument.');
	}

	return {
		dir: positionals[0],
		template: values.template ?? 'starter-jsx',
		repo: values.repo ?? 'ecopages/ecopages',
	};
}

function runLaunchPlan(launchPlan) {
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
					: 'Reinstall ecopages and its dependencies so the packaged tsx runtime is available for Node.js launches.';
			logger.error(`Command not found: ${launchPlan.command}. ${hint}`);
			process.exit(1);
		}

		logger.error(`Failed to run command: ${error.message}`);
		process.exit(1);
	});

	child.on('exit', (code) => {
		process.exit(code || 0);
	});
}

/**
 * Launch the entry file via the detected or forced runtime (bun or node).
 * Applies runtime-specific launch behavior for the selected runtime.
 * @param {string[]} args - Arguments to pass to the entry file
 * @param {object} options - CLI options (watch, hot, port, hostname, etc.)
 * @param {string} entryFile - Entry file to run
 */
async function runEntryCommand(args, options = {}, entryFile = 'app.ts') {
	let launchPlan;

	try {
		launchPlan = await createLaunchPlan(args, options, entryFile);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(message);
		process.exit(1);
	}

	if (!existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

	runLaunchPlan(launchPlan);
}

async function runInitCommand(rawArgs) {
	const parsed = parseInitCommandArgs(rawArgs);

	if (parsed.help) {
		return;
	}

	const { dir, template, repo } = parsed;

	if (existsSync(dir)) {
		logger.error(`Target directory already exists: ${dir}`);
		process.exit(1);
	}

	logger.info(`Creating target directory '${dir}'...`);

	try {
		await downloadTemplate(`github:${repo}/examples/${template}`, {
			dir,
			force: true,
		});

		const pkgPath = join(dir, 'package.json');
		if (existsSync(pkgPath)) {
			const projectPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
			projectPkg.name = dir;
			writeFileSync(pkgPath, JSON.stringify(projectPkg, null, 2) + '\n');
			logger.info(`Renamed project to '${dir}'`);
		}

		logger.info('Project initialized! Run `bun install && bun dev` to start.');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Failed to fetch template: ${message}`);
		process.exit(1);
	}
}

async function runServerCommand(rawArgs, definition) {
	const parsed = parseServerCommandArgs(rawArgs, definition.name, definition.description, definition.mode);

	if (parsed.help) {
		return;
	}

	await runEntryCommand(definition.entryArgs, { ...parsed.options, ...definition.optionOverrides }, parsed.entry);
}

export async function runCli(rawArgs = process.argv.slice(2)) {
	const [commandName, ...commandArgs] = rawArgs;

	if (!commandName || commandName === '--help' || commandName === '-h') {
		console.log(getMainHelpText());
		return;
	}

	if (commandName === '--version') {
		console.log(pkg.version);
		return;
	}

	try {
		switch (commandName) {
			case 'init':
				await runInitCommand(commandArgs);
				return;
			case 'dev':
				await runServerCommand(commandArgs, {
					name: 'dev',
					description: 'Start the development server.',
					entryArgs: ['--dev'],
					optionOverrides: { nodeEnv: 'development' },
				});
				return;
			case 'dev:watch':
				await runServerCommand(commandArgs, {
					name: 'dev:watch',
					description: 'Start the development server with watch mode.',
					entryArgs: ['--dev'],
					optionOverrides: { watch: true, nodeEnv: 'development' },
				});
				return;
			case 'dev:hot':
				await runServerCommand(commandArgs, {
					name: 'dev:hot',
					description: 'Start the development server with hot reload.',
					entryArgs: ['--dev'],
					optionOverrides: { hot: true, nodeEnv: 'development' },
				});
				return;
			case 'build':
				await runServerCommand(commandArgs, {
					name: 'build',
					description: 'Build the project for production.',
					entryArgs: ['--build'],
					optionOverrides: { nodeEnv: 'production' },
					mode: 'build',
				});
				return;
			case 'start':
				await runServerCommand(commandArgs, {
					name: 'start',
					description: 'Start the production server.',
					entryArgs: [],
					optionOverrides: { nodeEnv: 'production' },
				});
				return;
			case 'preview':
				await runServerCommand(commandArgs, {
					name: 'preview',
					description: 'Preview the production build.',
					entryArgs: ['--preview'],
					optionOverrides: { nodeEnv: 'production' },
				});
				return;
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
