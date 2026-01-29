#!/usr/bin/env bun
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const program = new Command();
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

program.name('ecopages').description('Ecopages CLI utilities').version(pkg.version);

function runBunCommand(args, options = {}) {
	const hasConfig = existsSync('eco.config.ts');
	const hasApp = existsSync('app.ts');

	if (!hasApp) {
		console.error('❌ Error: app.ts not found in the current directory.');
		process.exit(1);
	}

	const bunArgs = [];
	if (options.watch) bunArgs.push('--watch');
	if (options.hot) bunArgs.push('--hot');

	bunArgs.push('run');

	if (hasConfig) {
		bunArgs.push('--preload', 'eco.config.ts');
	}
	bunArgs.push('app.ts', ...args);

	console.log(`🚀 Running: bun ${bunArgs.join(' ')}`);

	const child = spawn('bun', bunArgs, { stdio: 'inherit' });
	child.on('exit', (code) => {
		process.exit(code || 0);
	});
}

program
	.command('dev')
	.description('Start the development server')
	.action(() => {
		runBunCommand(['--dev']);
	});

program
	.command('dev:watch')
	.description('Start the development server with watch mode')
	.action(() => {
		runBunCommand(['--dev'], { watch: true });
	});

program
	.command('dev:hot')
	.description('Start the development server with hot reload')
	.action(() => {
		runBunCommand(['--dev'], { hot: true });
	});

program
	.command('build')
	.description('Build the project for production')
	.action(() => {
		runBunCommand(['--build']);
	});

program
	.command('start')
	.description('Start the production server')
	.action(() => {
		runBunCommand([]);
	});

program
	.command('preview')
	.description('Preview the production build')
	.action(() => {
		runBunCommand(['--preview']);
	});

program.parse();
