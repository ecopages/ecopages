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
 */

export * from './types.ts';
export { BaseFileSystem } from './utils/common.ts';
export { BunFileSystem, bunFs } from './adapters/bun.ts';
export { NodeFileSystem, nodeFs } from './adapters/node.ts';

import type { FileSystem } from './types.ts';

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
