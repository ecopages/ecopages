/**
 * @module @ecopages/file-system
 * @description Runtime-agnostic file system utilities for Ecopages.
 *
 * Automatically selects the optimal adapter based on runtime:
 * - **Bun**: Uses `Bun.Glob`, `Bun.hash`, `Bun.file` for maximum performance
 * - **Node.js**: Uses `fast-glob` and `crypto` for compatibility
 *
 * @example
 * ```typescript
 * import { fileSystem } from '@ecopages/file-system';
 *
 * const files = await fileSystem.glob(['**\/*.ts']);
 * const content = await fileSystem.readFile('file.txt');
 * const hash = fileSystem.hash('file.txt');
 * ```
 */

export * from './types';
export { BaseFileSystem } from './utils/common';
export { BunFileSystem, bunFs } from './adapters/bun';
export { NodeFileSystem, nodeFs } from './adapters/node';

import type { FileSystem } from './types';

/**
 * Creates a FileSystem instance based on the current runtime.
 * Uses Bun adapter if Bun is available, otherwise Node adapter.
 */
function createFileSystem(): FileSystem {
	if (typeof Bun !== 'undefined') {
		const { bunFs } = require('./adapters/bun');
		return bunFs;
	}

	const { nodeFs } = require('./adapters/node');
	return nodeFs;
}

/**
 * Runtime-agnostic file system instance.
 * Automatically uses Bun or Node adapter based on environment.
 */
export const fileSystem: FileSystem = createFileSystem();
