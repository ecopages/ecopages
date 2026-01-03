#!/usr/bin/env bun
/**
 * Browser Test Runner Script
 * Starts the fixture server, runs vitest browser tests + E2E HMR tests, then stops.
 */

import { spawn } from 'bun';
import { Logger } from '@ecopages/logger';

const logger = new Logger('[test-runner]');
const TEST_PORT = 3002;

async function isPortInUse(): Promise<boolean> {
	try {
		await fetch(`http://localhost:${TEST_PORT}`);
		return true;
	} catch {
		return false;
	}
}

async function waitForServer(timeout = 30000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (await isPortInUse()) return true;
		await Bun.sleep(500);
	}
	return false;
}

async function main() {
	const alreadyRunning = await isPortInUse();

	let serverProc: ReturnType<typeof spawn> | null = null;

	if (!alreadyRunning) {
		logger.info('Starting fixture server...');
		serverProc = spawn({
			cmd: ['bun', 'run', 'packages/core/fixtures/test-server.ts'],
			stdout: 'inherit',
			stderr: 'inherit',
		});

		const ready = await waitForServer();
		if (!ready) {
			logger.error('Server failed to start');
			process.exit(1);
		}
		logger.info('Server ready');
	} else {
		logger.warn('Server already running');
	}

	logger.info('Running vitest browser tests...');
	const vitest = spawn({
		cmd: ['bunx', 'vitest', 'run'],
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const vitestExitCode = await vitest.exited;

	logger.info('Running E2E HMR tests...');
	const e2e = spawn({
		cmd: ['bunx', 'playwright', 'test', 'packages/core/src/hmr/hmr.test.e2e.ts'],
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const e2eExitCode = await e2e.exited;

	if (serverProc) {
		logger.info('Stopping server...');
		serverProc.kill();
	}

	process.exit(vitestExitCode !== 0 ? vitestExitCode : e2eExitCode);
}

main();
