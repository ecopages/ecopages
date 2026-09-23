#!/usr/bin/env bun
/**
 * Test Fixture Server
 * Starts the fixture app with HMR enabled on port 3002 for browser integration tests.
 * Usage: bun packages/core/__fixtures__/test-server.ts
 */

import { createFixtureApp } from './app/test-app-config.ts';
import { Logger } from '@ecopages/logger';

const logger = new Logger('[test-server]');

const TEST_PORT = 3002;

async function isPortInUse(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://localhost:${port}`);
		return response.ok || response.status > 0;
	} catch {
		return false;
	}
}

async function startServer() {
	if (await isPortInUse(TEST_PORT)) {
		logger.info(`Port ${TEST_PORT} already in use, skipping`);
		return;
	}

	if (!process.argv.includes('--dev')) {
		process.argv.push('--dev');
	}

	logger.info('Starting fixture server with HMR...');

	const app = await createFixtureApp({
		serverOptions: {
			port: TEST_PORT,
			hostname: 'localhost',
		},
	});

	await app.start(({ origin }) => {
		logger.info(`Fixture server running at ${origin}`);
		logger.info('Press Ctrl+C to stop');
	});

	const shutdown = async () => {
		logger.info('Stopping...');
		await app.stop(true);
		process.exit(0);
	};

	process.on('SIGINT', () => {
		void shutdown();
	});

	process.on('SIGTERM', () => {
		void shutdown();
	});
}

startServer();
