#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import tiged from 'tiged';
import { Logger } from '@ecopages/logger';

const logger = new Logger('[ecopages:cli]');

const program = new Command();
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

program.name('ecopages').description('Ecopages CLI utilities').version(pkg.version);

program
	.command('init <dir>')
	.description('Initialize a new project from a template')
	.option('--template <name>', 'Template name from ecopages/examples/', 'starter-jsx')
	.option('--repo <repo>', 'GitHub repo (user/repo)', 'ecopages/ecopages')
	.action(async (dir, opts) => {
		const { template, repo } = opts;
		const targetDir = dir;

		if (existsSync(targetDir)) {
			logger.error(`Target directory already exists: ${targetDir}`);
			process.exit(1);
		}

		logger.info(`Creating target directory '${targetDir}'...`);

		try {
			const emitter = tiged(`${repo}/examples/${template}`, {
				disableCache: true,
				force: true,
				verbose: false,
			});

			await emitter.clone(targetDir);
			logger.info('Project initialized! Run `bun install && bun dev` to start.');
		} catch (err) {
			logger.error(`Failed to fetch template: ${err.message}`);
			process.exit(1);
		}
	});

/**
 * Build environment variables from CLI options
 */
function buildEnvOverrides(options) {
	const env = {};
	if (options.port) env.ECOPAGES_PORT = String(options.port);
	if (options.hostname) env.ECOPAGES_HOSTNAME = options.hostname;
	if (options.baseUrl) env.ECOPAGES_BASE_URL = options.baseUrl;
	if (options.debug) env.ECOPAGES_LOGGER_DEBUG = 'true';
	if (options.nodeEnv) env.NODE_ENV = options.nodeEnv;
	return env;
}

function detectRuntime() {
	if (typeof Bun !== 'undefined') {
		return 'bun';
	}

	const bunVersionResult = spawnSync('bun', ['--version'], {
		stdio: 'ignore',
	});

	if (!bunVersionResult.error && bunVersionResult.status === 0) {
		return 'bun';
	}

	return 'node';
}

function buildBunArgs(args, options, entryFile, hasConfig) {
	const bunArgs = [];

	if (options.watch) bunArgs.push('--watch');
	if (options.hot) bunArgs.push('--hot');

	bunArgs.push('run');

	if (hasConfig) {
		bunArgs.push('--preload', 'eco.config.ts');
	}

	bunArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		bunArgs.push('--react-fast-refresh');
	}

	return bunArgs;
}

function buildNodeArgs(args, options, entryFile) {
	const tsxArgs = [];

	if (options.watch) tsxArgs.push('watch');

	tsxArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		tsxArgs.push('--react-fast-refresh');
	}

	return tsxArgs;
}

function createLaunchPlan(args, options = {}, entryFile = 'app.ts') {
	const hasConfig = existsSync('eco.config.ts');
	const envOverrides = buildEnvOverrides(options);
	const runtime = detectRuntime();

	if (runtime === 'node') {
		return {
			runtime,
			executionStrategy: 'tsx',
			command: 'tsx',
			commandArgs: buildNodeArgs(args, options, entryFile),
			envOverrides,
			env: { ...process.env, ...envOverrides },
		};
	}

	return {
		runtime,
		executionStrategy: 'direct-runtime',
		command: 'bun',
		commandArgs: buildBunArgs(args, options, entryFile, hasConfig),
		envOverrides,
		env: { ...process.env, ...envOverrides },
	};
}

function runLaunchPlan(launchPlan) {
	if (Object.keys(launchPlan.envOverrides).length > 0) {
		logger.info(`Environment overrides: ${JSON.stringify(launchPlan.envOverrides)}`);
	}

	logger.info(`Running: ${launchPlan.command} ${launchPlan.commandArgs.join(' ')}`);

	const child = spawn(launchPlan.command, launchPlan.commandArgs, {
		stdio: 'inherit',
		env: launchPlan.env,
	});

	child.on('error', (error) => {
		if (error && error.code === 'ENOENT') {
			const hint =
				launchPlan.command === 'bun'
					? 'Install Bun from https://bun.sh to continue.'
					: 'Install tsx (`npm i -g tsx` or add it as a devDependency) to continue.';
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
 * Execute a bun command with the given arguments and options.
 * Automatically detects eco.config.ts and applies preloads.
 * @param {string[]} args - Arguments to pass to the entry file
 * @param {object} options - CLI options (watch, hot, port, hostname, etc.)
 * @param {string} entryFile - Entry file to run
 */
function runBunCommand(args, options = {}, entryFile = 'app.ts') {
	if (!existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

	const launchPlan = createLaunchPlan(args, options, entryFile);
	runLaunchPlan(launchPlan);
}

/**
 * Add shared server options to a command.
 * @param {import('commander').Command} cmd - The command to add options to
 * @returns {import('commander').Command} The command with options added
 */
const serverOptions = (cmd) =>
	cmd
		.option('-p, --port <port>', 'Override ECOPAGES_PORT')
		.option('-n, --hostname <hostname>', 'Override ECOPAGES_HOSTNAME')
		.option('-b, --base-url <url>', 'Override ECOPAGES_BASE_URL')
		.option('-d, --debug', 'Enable debug logging (ECOPAGES_LOGGER_DEBUG=true)')
		.option('-r, --react-fast-refresh', 'Enable React Fast Refresh for HMR');

serverOptions(
	program.command('dev').description('Start the development server').argument('[entry]', 'Entry file', 'app.ts'),
).action((entry, opts) => {
	runBunCommand(['--dev'], { ...opts, nodeEnv: 'development' }, entry);
});

serverOptions(
	program
		.command('dev:watch')
		.description('Start the development server with watch mode (restarts on file changes)')
		.argument('[entry]', 'Entry file', 'app.ts'),
).action((entry, opts) => {
	runBunCommand(['--dev'], { ...opts, watch: true, nodeEnv: 'development' }, entry);
});

serverOptions(
	program
		.command('dev:hot')
		.description('Start the development server with hot reload (HMR without restart)')
		.argument('[entry]', 'Entry file', 'app.ts'),
).action((entry, opts) => {
	runBunCommand(['--dev'], { ...opts, hot: true, nodeEnv: 'development' }, entry);
});

program
	.command('build')
	.description('Build the project for production')
	.argument('[entry]', 'Entry file', 'app.ts')
	.action((entry) => {
		runBunCommand(['--build'], { nodeEnv: 'production' }, entry);
	});

serverOptions(
	program.command('start').description('Start the production server').argument('[entry]', 'Entry file', 'app.ts'),
).action((entry, opts) => {
	runBunCommand([], { ...opts, nodeEnv: 'production' }, entry);
});

serverOptions(
	program.command('preview').description('Preview the production build').argument('[entry]', 'Entry file', 'app.ts'),
).action((entry, opts) => {
	runBunCommand(['--preview'], { ...opts, nodeEnv: 'production' }, entry);
});

program.parse();
