/**
 * @module @ecopages/file-system/adapters/bun
 * @description Bun-optimized file system adapter using Bun.Glob, Bun.hash, and Bun.file.
 */

import type { GlobScanOptions } from 'bun';
import type { FileSystem, GlobOptions } from '../types';
import { BaseFileSystem } from '../utils/common';

/**
 * Bun-optimized implementation of the FileSystem interface.
 * Falls back to Node.js APIs for operations not optimized by Bun.
 */
export class BunFileSystem extends BaseFileSystem implements FileSystem {
	/**
	 * Glob patterns using Bun.Glob for fast matching.
	 */
	async glob(patterns: string[], options: GlobOptions = {}): Promise<string[]> {
		const scanOptions: GlobScanOptions = {
			cwd: options.cwd ?? process.cwd(),
		};

		const promises = patterns.map((pattern) => {
			const glob = new Bun.Glob(pattern);
			return Array.fromAsync(glob.scan(scanOptions));
		});

		const results = await Promise.all(promises);
		return results.flat();
	}

	/**
	 * Read file using Bun.file for optimized I/O.
	 */
	async readFile(path: string): Promise<string> {
		try {
			this.verifyFileExists(path);
			return Bun.file(path).text();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error reading file: ${path}, ${message}`);
		}
	}

	/**
	 * Hash file contents using Bun.hash for fast hashing.
	 */
	hash(path: string): string {
		try {
			const buffer = this.readFileAsBuffer(path);
			return Bun.hash(buffer).toString();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error hashing file: ${path}. Cause: ${message}`);
		}
	}
}

/**
 * Singleton instance for Bun runtime.
 */
export const bunFs = new BunFileSystem();
