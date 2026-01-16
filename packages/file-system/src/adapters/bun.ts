/**
 * @module @ecopages/file-system/adapters/bun
 * @description Bun-optimized file system adapter using Bun.Glob, Bun.hash, and Bun.file.
 */

import type { GlobScanOptions } from 'bun';
import type { FileSystem, GlobOptions } from '../types.ts';
import { BaseFileSystem } from '../utils/common.ts';

/**
 * Bun-optimized implementation of the FileSystem interface.
 * Falls back to Node.js APIs for operations not optimized by Bun.
 */
export class BunFileSystem extends BaseFileSystem implements FileSystem {
	/**
	 * Glob patterns using Bun.Glob for fast matching.
	 * Supports ignore patterns via post-filtering (Bun.Glob doesn't have native ignore support).
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
		let files = results.flat();

		// Filter out ignored patterns if provided
		if (options.ignore?.length) {
			const ignoreGlobs = options.ignore.map((pattern) => new Bun.Glob(pattern));
			files = files.filter((file) => !ignoreGlobs.some((glob) => glob.match(file)));
		}

		return files;
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

	/**
	 * Write file using Bun.write for optimized I/O with syscall optimization.
	 * Uses copy_file_range, sendfile, clonefile depending on platform.
	 */
	override async writeAsync(filepath: string, contents: string | Buffer): Promise<void> {
		try {
			this.ensureDir(require('node:path').dirname(filepath));
			await Bun.write(filepath, contents);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error writing file: ${filepath}. Cause: ${message}`);
		}
	}
}

/**
 * Singleton instance for Bun runtime.
 */
export const bunFs: BunFileSystem = new BunFileSystem();
