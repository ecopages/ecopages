#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import tiged from 'tiged';
import { Logger } from '@ecopages/logger';
import { createLaunchPlan, launchPlanRequiresExistingEntryFile } from './launch-plan.js';

const logger = new Logger('[ecopages:cli]');

const program = new Command();
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

program.name('ecopages').description('Ecopages CLI utilities').version(pkg.version);

async function handleInit(dir, opts) {
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

		const pkgPath = join(targetDir, 'package.json');
		if (existsSync(pkgPath)) {
			const projectPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
			projectPkg.name = dir;
			writeFileSync(pkgPath, JSON.stringify(projectPkg, null, 2) + '\n');
			logger.info(`Renamed project to '${dir}'`);
		}

		logger.info('Project initialized! Run `bun install && bun dev` to start.');
	} catch (err) {
		logger.error(`Failed to fetch template: ${err.message}`);
		process.exit(1);
	}
}

program
	.command('init <dir>')
	.description('Initialize a new project from a template')
	.option('--template <name>', 'Template name from ecopages/examples/', 'starter-jsx')
	.option('--repo <repo>', 'GitHub repo (user/repo)', 'ecopages/ecopages')
	.action(handleInit);

function runLaunchPlan(launchPlan) {
	if (Object.keys(launchPlan.envOverrides).length > 0) {
		logger.info(`Environment overrides: ${JSON.stringify(launchPlan.envOverrides)}`);
	}

	logger.info(`Runtime: ${launchPlan.runtime}`);
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
					: 'Install Node.js and ensure the `node` command is available to continue.';
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
async function runBunCommand(args, options = {}, entryFile = 'app.ts') {
	const launchPlan = await createLaunchPlan(args, options, entryFile);

	if (launchPlanRequiresExistingEntryFile(launchPlan) && !existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

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
		.option('-r, --react-fast-refresh', 'Enable React Fast Refresh for HMR')
		.option('--runtime <runtime>', 'Force a specific runtime (bun, node, or node-experimental)');

serverOptions(
	program.command('dev').description('Start the development server').argument('[entry]', 'Entry file', 'app.ts'),
).action(async (entry, opts) => {
	await runBunCommand(['--dev'], { ...opts, nodeEnv: 'development' }, entry);
});

serverOptions(
	program
		.command('dev:watch')
		.description('Start the development server with watch mode (restarts on file changes)')
		.argument('[entry]', 'Entry file', 'app.ts'),
).action(async (entry, opts) => {
	await runBunCommand(['--dev'], { ...opts, watch: true, nodeEnv: 'development' }, entry);
});

serverOptions(
	program
		.command('dev:hot')
		.description('Start the development server with hot reload (HMR without restart)')
		.argument('[entry]', 'Entry file', 'app.ts'),
).action(async (entry, opts) => {
	await runBunCommand(['--dev'], { ...opts, hot: true, nodeEnv: 'development' }, entry);
});

program
	.command('build')
	.description('Build the project for production')
	.argument('[entry]', 'Entry file', 'app.ts')
	.option('--runtime <runtime>', 'Force a specific runtime (bun, node, or node-experimental)')
	.action(async (entry, opts) => {
		await runBunCommand(['--build'], { nodeEnv: 'production', ...opts }, entry);
	});

serverOptions(
	program.command('start').description('Start the production server').argument('[entry]', 'Entry file', 'app.ts'),
).action(async (entry, opts) => {
	await runBunCommand([], { ...opts, nodeEnv: 'production' }, entry);
});

serverOptions(
	program.command('preview').description('Preview the production build').argument('[entry]', 'Entry file', 'app.ts'),
).action(async (entry, opts) => {
	await runBunCommand(['--preview'], { ...opts, nodeEnv: 'production' }, entry);
});

program.parse();
