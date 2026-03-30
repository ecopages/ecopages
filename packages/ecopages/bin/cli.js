#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import { downloadTemplate } from 'giget';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Logger } from '@ecopages/logger';
import { createLaunchPlan, launchPlanRequiresExistingEntryFile } from './launch-plan.js';

const logger = new Logger('[ecopages:cli]');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

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
 * Launch the entry file via the detected or forced runtime (bun or node).
 * Automatically detects eco.config.ts and applies preloads.
 * @param {string[]} args - Arguments to pass to the entry file
 * @param {object} options - CLI options (watch, hot, port, hostname, etc.)
 * @param {string} entryFile - Entry file to run
 */
async function runEntryCommand(args, options = {}, entryFile = 'app.ts') {
	const launchPlan = await createLaunchPlan(args, options, entryFile);

	if (launchPlanRequiresExistingEntryFile(launchPlan) && !existsSync(entryFile)) {
		logger.error(`Error: Entry file "${entryFile}" not found in the current directory.`);
		process.exit(1);
	}

	runLaunchPlan(launchPlan);
}

/** Shared server argument definitions for citty commands. */
const serverArgs = {
	entry: {
		type: 'positional',
		description: 'Entry file',
		default: 'app.ts',
	},
	port: {
		type: 'string',
		alias: ['p'],
		description: 'Override ECOPAGES_PORT',
	},
	hostname: {
		type: 'string',
		alias: ['n'],
		description: 'Override ECOPAGES_HOSTNAME',
	},
	'base-url': {
		type: 'string',
		alias: ['b'],
		description: 'Override ECOPAGES_BASE_URL',
	},
	debug: {
		type: 'boolean',
		alias: ['d'],
		description: 'Enable debug logging (ECOPAGES_LOGGER_DEBUG=true)',
	},
	'react-fast-refresh': {
		type: 'boolean',
		alias: ['r'],
		description: 'Enable React Fast Refresh for HMR',
	},
	runtime: {
		type: 'string',
		description: 'Force a specific runtime (bun, node, or node-experimental)',
	},
};

const initCommand = defineCommand({
	meta: {
		name: 'init',
		description: 'Initialize a new project from a template',
	},
	args: {
		dir: {
			type: 'positional',
			description: 'Target directory name',
			required: true,
		},
		template: {
			type: 'string',
			description: 'Template name from ecopages/examples/',
			default: 'starter-jsx',
		},
		repo: {
			type: 'string',
			description: 'GitHub repo (user/repo)',
			default: 'ecopages/ecopages',
		},
	},
	async run({ args }) {
		const { dir, template, repo } = args;

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
		} catch (err) {
			logger.error(`Failed to fetch template: ${err.message}`);
			process.exit(1);
		}
	},
});

const devCommand = defineCommand({
	meta: {
		name: 'dev',
		description: 'Start the development server',
	},
	args: serverArgs,
	async run({ args }) {
		await runEntryCommand(['--dev'], { ...args, nodeEnv: 'development' }, args.entry);
	},
});

const devWatchCommand = defineCommand({
	meta: {
		name: 'dev:watch',
		description: 'Start the development server with watch mode (restarts on file changes)',
	},
	args: serverArgs,
	async run({ args }) {
		await runEntryCommand(['--dev'], { ...args, watch: true, nodeEnv: 'development' }, args.entry);
	},
});

const devHotCommand = defineCommand({
	meta: {
		name: 'dev:hot',
		description: 'Start the development server with hot reload (HMR without restart)',
	},
	args: serverArgs,
	async run({ args }) {
		await runEntryCommand(['--dev'], { ...args, hot: true, nodeEnv: 'development' }, args.entry);
	},
});

const buildCommand = defineCommand({
	meta: {
		name: 'build',
		description: 'Build the project for production',
	},
	args: {
		entry: {
			type: 'positional',
			description: 'Entry file',
			default: 'app.ts',
		},
		runtime: {
			type: 'string',
			description: 'Force a specific runtime (bun, node, or node-experimental)',
		},
	},
	async run({ args }) {
		await runEntryCommand(['--build'], { nodeEnv: 'production', ...args }, args.entry);
	},
});

const startCommand = defineCommand({
	meta: {
		name: 'start',
		description: 'Start the production server',
	},
	args: serverArgs,
	async run({ args }) {
		await runEntryCommand([], { ...args, nodeEnv: 'production' }, args.entry);
	},
});

const previewCommand = defineCommand({
	meta: {
		name: 'preview',
		description: 'Preview the production build',
	},
	args: serverArgs,
	async run({ args }) {
		await runEntryCommand(['--preview'], { ...args, nodeEnv: 'production' }, args.entry);
	},
});

export const mainCommand = defineCommand({
	meta: {
		name: 'ecopages',
		version: pkg.version,
		description: 'Ecopages CLI utilities',
	},
	subCommands: {
		init: initCommand,
		dev: devCommand,
		'dev:watch': devWatchCommand,
		'dev:hot': devHotCommand,
		build: buildCommand,
		start: startCommand,
		preview: previewCommand,
	},
});

if (!process.env.VITEST) {
	runMain(mainCommand);
}
