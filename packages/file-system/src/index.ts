/**
 * @module @ecopages/file-system
 * @description File system utilities for Ecopages. The implementation is Node's.
 *
 * @example
 * ```typescript
 * import { fileSystem } from '@ecopages/file-system';
 *
 * const files = await fileSystem.glob(['**\/*.ts']);
 * const content = await fileSystem.readFile('file.txt');
 */

import type {} from './load-bun-types.ts';
import type { FileSystem } from './types.ts';
import { NodeFileSystem, nodeFs } from './adapters/node.ts';
import { BaseFileSystem } from './utils/common.ts';

export * from './types.ts';
export { BaseFileSystem, NodeFileSystem, nodeFs };

/**
 * File system instance. It is the Node implementation on every runtime, including Bun.
 */
export const fileSystem: FileSystem = nodeFs;
