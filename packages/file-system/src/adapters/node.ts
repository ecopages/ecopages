/**
 * @module @ecopages/file-system/adapters/node
 * @description Node.js file system adapter using fast-glob and crypto.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import type { FileSystem, GlobOptions } from '../types';
import { BaseFileSystem } from '../utils/common';

/**
 * Node.js implementation of the FileSystem interface.
 * Uses fast-glob for glob matching and crypto for hashing.
 */
export class NodeFileSystem extends BaseFileSystem implements FileSystem {
	/**
	 * Glob patterns using fast-glob.
	 */
	async glob(patterns: string[], options: GlobOptions = {}): Promise<string[]> {
		return fg(patterns, {
			cwd: options.cwd ?? process.cwd(),
			ignore: options.ignore,
		});
	}

	/**
	 * Read file using Node.js fs.promises.
	 */
	async readFile(path: string): Promise<string> {
		try {
			this.verifyFileExists(path);
			return fs.readFile(path, 'utf-8');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error reading file: ${path}, ${message}`);
		}
	}

	/**
	 * Hash file contents using Node.js crypto.
	 */
	hash(path: string): string {
		try {
			const buffer = this.readFileAsBuffer(path);
			return crypto.createHash('sha256').update(buffer).digest('hex');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error hashing file: ${path}. Cause: ${message}`);
		}
	}
}

/**
 * Singleton instance for Node.js runtime.
 */
export const nodeFs: NodeFileSystem = new NodeFileSystem();
