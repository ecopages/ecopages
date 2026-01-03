#!/usr/bin/env bun
/**
 * Test Fixture Server
 * Starts the fixture app with HMR enabled on port 3002 for browser integration tests.
 * Usage: bun packages/core/fixtures/test-server.ts
 */

import { ConfigBuilder } from '../src/config/config-builder';
import { createBunServerAdapter } from '../src/adapters/bun/server-adapter';
import { Logger } from '@ecopages/logger';

const logger = new Logger('[test-server]');

const FIXTURE_APP_DIR = import.meta.dir + '/app';
const TEST_PORT = 3002;
const TEST_URL = `http://localhost:${TEST_PORT}`;

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

	logger.info('Starting fixture server with HMR...');

	const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_DIR).build();

	const serverAdapter = await createBunServerAdapter({
		appConfig,
		runtimeOrigin: TEST_URL,
		options: { watch: true },
		serveOptions: {
			port: TEST_PORT,
			hostname: 'localhost',
		},
		apiHandlers: [],
	});

	const server = Bun.serve(serverAdapter.getServerOptions({ enableHmr: true }) as any);
	await serverAdapter.completeInitialization(server);

	logger.info(`Fixture server running at ${TEST_URL}`);
	logger.info('Press Ctrl+C to stop');

	process.on('SIGINT', () => {
		logger.info('\nStopping...');
		server.stop(true);
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		console.log('\n[test-server] Stopping...');
		server.stop(true);
		process.exit(0);
	});
}

startServer();
