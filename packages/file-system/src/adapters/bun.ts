/**
 * @module @ecopages/file-system/adapters/bun
 * @description Bun-optimized file system adapter using Bun.Glob, Bun.hash, and Bun.file.
 */

import { dirname } from 'node:path';
import type { GlobScanOptions } from 'bun';
import type { FileSystem, GlobOptions } from '../types.ts';
import { BaseFileSystem } from '../utils/common.ts';

/**
 * Bun-optimized implementation of the FileSystem interface.
 */
export class BunFileSystem extends BaseFileSystem implements FileSystem {
	async existsAsync(path: string): Promise<boolean> {
		return Bun.file(path).exists();
	}

	async readFile(path: string): Promise<string> {
		try {
			this.verifyFileExists(path);
			return await Bun.file(path).text();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error reading file: ${path}, ${message}`);
		}
	}

	async writeAsync(filepath: string, contents: string | Buffer): Promise<void> {
		try {
			await this.ensureDirAsync(dirname(filepath));
			await Bun.write(filepath, contents);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error writing file: ${filepath}. Cause: ${message}`);
		}
	}

	async copyFileAsync(source: string, destination: string): Promise<void> {
		try {
			await Bun.write(destination, Bun.file(source));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error copying file: ${source} to ${destination}. Cause: ${message}`);
		}
	}

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

		if (options.ignore?.length) {
			const ignoreGlobs = options.ignore.map((pattern) => new Bun.Glob(pattern));
			files = files.filter((file) => !ignoreGlobs.some((glob) => glob.match(file)));
		}

		return files;
	}

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
export const bunFs: BunFileSystem = new BunFileSystem();
