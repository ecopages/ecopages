#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { Logger } from '@ecopages/logger';
import { assertNodeRuntimeManifest, createNodeRuntimeAdapter } from '@ecopages/core/node/runtime-adapter';
import { fileURLToPath } from 'node:url';

const logger = new Logger('[ecopages:node-thin-host]');

function formatErrorForLog(error) {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}

	return String(error);
}

function attachShutdownHandlers(session) {
	let shutdownPromise;

	const shutdown = async (signal) => {
		if (!shutdownPromise) {
			shutdownPromise = (async () => {
				try {
					logger.info(`Received ${signal}. Shutting down Node thin-host runtime.`);
					await session.dispose();
				} catch (error) {
					logger.error(formatErrorForLog(error));
				} finally {
					process.exit(0);
				}
			})();
		}

		await shutdownPromise;
	};

	process.once('SIGINT', () => {
		void shutdown('SIGINT');
	});
	process.once('SIGTERM', () => {
		void shutdown('SIGTERM');
	});
}

/**
 * Creates the host-to-adapter handoff payload for the Node thin-host runtime.
 */
export function createRuntimeStartOptions(options = {}) {
	return {
		manifest: options.manifest ?? readRuntimeManifest(),
		workingDirectory: options.workingDirectory ?? process.cwd(),
		cliArgs: options.cliArgs ?? process.argv.slice(2),
	};
}

export function readRuntimeManifest() {
	const manifestFilePath = process.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH;

	if (!manifestFilePath) {
		throw new Error('Missing ECOPAGES_NODE_RUNTIME_MANIFEST_PATH for Node thin-host launch.');
	}

	let serializedManifest;

	try {
		serializedManifest = readFileSync(manifestFilePath, 'utf8');
	} catch (error) {
		throw new Error(
			`Failed to read ECOPAGES_NODE_RUNTIME_MANIFEST_PATH at ${manifestFilePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	let parsedManifest;

	try {
		parsedManifest = JSON.parse(serializedManifest);
	} catch (error) {
		throw new Error(
			`Invalid Node runtime manifest JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return assertNodeRuntimeManifest(parsedManifest);
}

/**
 * Starts the Node thin-host runtime by delegating validated input to the
 * adapter boundary.
 *
 * @remarks
 * This function intentionally keeps the thin host transport-oriented. It does
 * not own framework bootstrap policy beyond reading the manifest, creating the
 * adapter, and delegating startup plus shutdown lifecycle.
 */
export async function startThinHostRuntime(options = {}) {
	const adapter = options.adapter ?? createNodeRuntimeAdapter();
	const startOptions = createRuntimeStartOptions(options);
	const session = await adapter.start(startOptions);
	let loadedAppRuntime;

	try {
		loadedAppRuntime = await session.loadApp();
	} catch (error) {
		try {
			await session.dispose();
		} catch (disposeError) {
			throw new Error(
				`Failed to dispose Node thin-host runtime session after bootstrap error: ${disposeError instanceof Error ? disposeError.message : String(disposeError)}`,
				{ cause: error instanceof Error ? error : undefined },
			);
		}

		throw error;
	}

	if (options.attachShutdownHandlers !== false) {
		attachShutdownHandlers(session);
	}

	return {
		session,
		loadedAppRuntime,
	};
}

async function main() {
	try {
		await startThinHostRuntime();
	} catch (error) {
		logger.error(formatErrorForLog(error));
		process.exit(1);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main();
}
