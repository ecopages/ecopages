/**
 * This module contains utility functions for file operations.
 * @module
 */

import {
	cpSync,
	existsSync,
	mkdir,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	writeFile,
	writeFileSync,
} from 'node:fs';
import { rm as rmAsync, rmdir as rmdirAsync } from 'node:fs/promises';
import path, { extname } from 'node:path';
import zlib from 'node:zlib';
import type { GlobScanOptions } from 'bun';
import { appLogger } from '../global/app-logger';

/**
 * Copy a directory synchronously.
 * @param source
 * @param destination
 */
/**
 * Custom error class for file not found errors.
 */
export class FileNotFoundError extends Error {
	code = 'ENOENT';
	constructor(path: string) {
		super(`File: ${path} not found`);
		this.name = 'FileNotFoundError';
	}
}

/**
 * Utility functions for file operations.
 */
export class FileUtils {
	/**
	 * Scan the file system for files that match the given pattern.
	 * @param pattern
	 * @param scanOptions
	 * @returns
	 */
	static async glob(
		pattern: string[],
		scanOptions: string | GlobScanOptions = { cwd: process.cwd() },
	): Promise<string[]> {
		const promises = pattern.map((p) => {
			const glob = new Bun.Glob(p);
			return Array.fromAsync(glob.scan(scanOptions));
		});

		const results = await Promise.all(promises);
		return results.flat();
	}

	/**
	 * Read a file and return its contents as a buffer.
	 * @param path
	 * @returns
	 */
	static getFileAsBuffer(path: string): Buffer {
		try {
			return readFileSync(path);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`, { cause: error });
		}
	}

	/**
	 * Verify that a file exists.
	 * @param path
	 * @throws FileNotFoundError
	 */
	static verifyFileExists(path: string): void {
		if (!existsSync(path)) {
			throw new FileNotFoundError(path);
		}
	}

	/**
	 * Check if a file or directory exists.
	 */
	static existsSync = existsSync;

	/**
	 * Write contents to a file.
	 * @param filepath
	 * @param contents
	 */
	static write(filepath: string, contents: string | Buffer): void {
		try {
			const dirs = filepath.split('/');
			let currentPath = '';
			for (let i = 0; i < dirs.length - 1; i++) {
				currentPath += `${dirs[i]}/`;
				if (!existsSync(currentPath)) {
					mkdirSync(currentPath);
				}
			}
			FileUtils.ensureDirectoryExists(path.dirname(filepath));
			writeFileSync(filepath, contents);
		} catch (error) {
			appLogger.error(error instanceof Error ? error.message : String(error));
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[ecopages] Error writing file: ${path}. Cause: ${message}`);
		}
	}

	/**
	 * Ensure that a directory exists.
	 * @param path
	 * @param forceCleanup
	 */
	static ensureDirectoryExists(dirPath: string, forceCleanup?: boolean): void {
		if (forceCleanup && existsSync(dirPath)) {
			rmSync(dirPath, { recursive: true, force: true });
		}

		mkdirSync(dirPath, { recursive: true });
	}

	/**
	 * Copy a directory synchronously.
	 * @param source
	 * @param destination
	 */
	static copyDirSync(source: string, destination: string) {
		cpSync(source, destination, { recursive: true });
	}

	/**
	 * Copy a file synchronously.
	 * @param source
	 * @param destination
	 */
	static copyFileSync(source: string, destination: string) {
		cpSync(source, destination);
	}

	/**
	 * Gzip all files in a directory.
	 * @param path
	 * @param extensionsToGzip
	 */
	static gzipDirSync(path: string, extensionsToGzip: string[]) {
		// @ts-expect-error: inconsistent type for readdirSync
		const files = readdirSync(path, { recursive: true });
		for (const file of files) {
			const ext = extname(file as string).slice(1);
			if (extensionsToGzip.includes(ext)) FileUtils.gzipFileSync(`${path}/${file}`);
		}
	}

	/**
	 * Gzip a file.
	 * @param path
	 */
	static gzipFileSync(path: string) {
		const data = FileUtils.getFileAsBuffer(path);
		const compressedData = zlib.gzipSync(Buffer.from(data));
		const gzipFile = `${path}.gz`;
		writeFileSync(gzipFile, compressedData);
	}

	static writeFileSync = writeFileSync;
	static readFileSync = readFileSync;
	static readdirSync = readdirSync;
	static mkdirSync = mkdirSync;
	static rmSync = rmSync;
	static rmAsync = rmAsync;
	static rmdirAsync = rmdirAsync;
	static rmdirSync = rmdirSync;
	static mkdir = mkdir;
	static writeFile = writeFile;

	static isDirectory(path: string): boolean {
		return existsSync(path) && statSync(path).isDirectory();
	}

	/**
	 * Get the hash of a file.
	 * @param path
	 * @returns
	 */
	static getFileHash(path: string): string {
		try {
			const buffer = FileUtils.getFileAsBuffer(path);
			return Bun.hash(buffer).toString();
		} catch (error) {
			appLogger.error(error instanceof Error ? error.message : String(error));
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[ecopages] Error hashing file: ${path}. Cause: ${message}`);
		}
	}

	/**
	 * Implement the synchronous version of `rm -rf`.
	 * @param path
	 */
	static emptyDirSync(path: string) {
		rmSync(path, {
			recursive: true,
			force: true,
		});
	}

	static async getFileAsString(path: string): Promise<string> {
		try {
			FileUtils.verifyFileExists(path);
			return Bun.file(path).text();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
		}
	}
}
