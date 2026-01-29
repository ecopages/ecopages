#!/usr/bin/env bun
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Logger } from '@ecopages/logger';

const logger = new Logger('[ecopages:cli]');

const program = new Command();
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

program.name('ecopages').description('Ecopages CLI utilities').version(pkg.version);

/**
 * Build environment variables from CLI options
 */
function buildEnvOverrides(options) {
	const env = {};
	if (options.port) env.ECOPAGES_PORT = String(options.port);
	if (options.hostname) env.ECOPAGES_HOSTNAME = options.hostname;
	if (options.baseUrl) env.ECOPAGES_BASE_URL = options.baseUrl;
	if (options.debug) env.ECOPAGES_LOGGER_DEBUG = 'true';
	return env;
}

/**
 * Execute a bun command with the given arguments and options.
 * Automatically detects eco.config.ts and applies preloads.
 * @param {string[]} args - Arguments to pass to the entry file
 * @param {object} options - CLI options (watch, hot, port, hostname, etc.)
 * @param {string} entryFile - Entry file to run
 */
function runBunCommand(args, options = {}, entryFile = 'app.ts') {
	const hasConfig = existsSync('eco.config.ts');
	if (!existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

	const bunArgs = [];
	if (options.watch) bunArgs.push('--watch');
	if (options.hot) bunArgs.push('--hot');

	bunArgs.push('run');

	if (hasConfig) {
		bunArgs.push('--preload', 'eco.config.ts');
	}
	bunArgs.push(entryFile, ...args);

	/** Merge CLI overrides with current environment */
	const envOverrides = buildEnvOverrides(options);
	const env = { ...process.env, ...envOverrides };

	if (Object.keys(envOverrides).length > 0) {
		logger.info(`Environment overrides: ${JSON.stringify(envOverrides)}`);
	}
	logger.info(`Running: bun ${bunArgs.join(' ')}`);

	const child = spawn('bun', bunArgs, { stdio: 'inherit', env });
	child.on('exit', (code) => {
		process.exit(code || 0);
	});
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
		.option('-d, --debug', 'Enable debug logging (ECOPAGES_LOGGER_DEBUG=true)');

program
	.command('dev')
	.description('Start the development server')
	.argument('[entry]', 'Entry file', 'app.ts')
	.tap(serverOptions)
	.action((entry, opts) => {
		runBunCommand(['--dev'], opts, entry);
	});

program
	.command('dev:watch')
	.description('Start the development server with watch mode (restarts on file changes)')
	.argument('[entry]', 'Entry file', 'app.ts')
	.tap(serverOptions)
	.action((entry, opts) => {
		runBunCommand(['--dev'], { ...opts, watch: true }, entry);
	});

program
	.command('dev:hot')
	.description('Start the development server with hot reload (HMR without restart)')
	.argument('[entry]', 'Entry file', 'app.ts')
	.tap(serverOptions)
	.action((entry, opts) => {
		runBunCommand(['--dev'], { ...opts, hot: true }, entry);
	});

program
	.command('build')
	.description('Build the project for production')
	.argument('[entry]', 'Entry file', 'app.ts')
	.action((entry) => {
		runBunCommand(['--build'], {}, entry);
	});

program
	.command('start')
	.description('Start the production server')
	.argument('[entry]', 'Entry file', 'app.ts')
	.tap(serverOptions)
	.action((entry, opts) => {
		runBunCommand([], opts, entry);
	});

program
	.command('preview')
	.description('Preview the production build')
	.argument('[entry]', 'Entry file', 'app.ts')
	.tap(serverOptions)
	.action((entry, opts) => {
		runBunCommand(['--preview'], opts, entry);
	});

program.parse();
