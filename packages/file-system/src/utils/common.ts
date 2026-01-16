/**
 * @module @ecopages/file-system/utils/common
 * @description Shared utilities used by both Bun and Node adapters.
 */

import path from 'node:path';
import zlib from 'node:zlib';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { rm as rmAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import { extname } from 'node:path';
import { FileNotFoundError } from '../types.ts';

/**
 * Base implementation for file system operations.
 * Subclasses override specific methods with runtime-optimized versions.
 */
export abstract class BaseFileSystem {
	/**
	 * Check if a file or directory exists.
	 */
	exists(filePath: string): boolean {
		return existsSync(filePath);
	}

	/**
	 * Verify that a file exists, throw FileNotFoundError if not.
	 */
	verifyFileExists(filePath: string): void {
		if (!existsSync(filePath)) {
			throw new FileNotFoundError(filePath);
		}
	}

	/**
	 * Read a file as a string synchronously.
	 */
	readFileSync(filePath: string): string {
		try {
			return readFileSync(filePath, 'utf-8');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error reading file: ${filePath}, ${message}`, { cause: error });
		}
	}

	/**
	 * Read a file as a Buffer.
	 */
	readFileAsBuffer(filePath: string): Buffer {
		try {
			return readFileSync(filePath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error reading file: ${filePath}, ${message}`, { cause: error });
		}
	}

	/**
	 * Write contents to a file synchronously.
	 */
	write(filepath: string, contents: string | Buffer): void {
		try {
			this.ensureDir(path.dirname(filepath));
			writeFileSync(filepath, contents);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error writing file: ${filepath}. Cause: ${message}`);
		}
	}

	/**
	 * Write contents to a file asynchronously.
	 */
	async writeAsync(filepath: string, contents: string | Buffer): Promise<void> {
		try {
			this.ensureDir(path.dirname(filepath));
			await writeFileAsync(filepath, contents);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error writing file: ${filepath}. Cause: ${message}`);
		}
	}

	/**
	 * Ensure a directory exists.
	 */
	ensureDir(dirPath: string, forceCleanup?: boolean): void {
		if (forceCleanup && existsSync(dirPath)) {
			rmSync(dirPath, { recursive: true, force: true });
		}
		mkdirSync(dirPath, { recursive: true });
	}

	/**
	 * Copy a directory recursively.
	 */
	copyDir(source: string, destination: string): void {
		cpSync(source, destination, { recursive: true });
	}

	/**
	 * Copy a file.
	 */
	copyFile(source: string, destination: string): void {
		cpSync(source, destination);
	}

	/**
	 * Remove all contents of a directory.
	 */
	emptyDir(dirPath: string): void {
		rmSync(dirPath, { recursive: true, force: true });
	}

	/**
	 * Remove a file or directory synchronously.
	 */
	remove(filePath: string): void {
		rmSync(filePath, { recursive: true, force: true });
	}

	/**
	 * Remove a file or directory asynchronously.
	 */
	async removeAsync(filePath: string): Promise<void> {
		await rmAsync(filePath, { recursive: true, force: true });
	}

	/**
	 * Check if a path is a directory.
	 */
	isDirectory(filePath: string): boolean {
		return existsSync(filePath) && statSync(filePath).isDirectory();
	}

	/**
	 * Gzip a single file.
	 */
	gzipFile(filePath: string): void {
		const data = this.readFileAsBuffer(filePath);
		const compressedData = zlib.gzipSync(Buffer.from(data));
		const gzipFile = `${filePath}.gz`;
		writeFileSync(gzipFile, compressedData);
	}

	/**
	 * Gzip all files with specified extensions in a directory.
	 */
	gzipDir(dirPath: string, extensionsToGzip: string[]): void {
		const files: string[] = readdirSync(dirPath, { recursive: true }) as string[];
		for (const file of files) {
			const ext = extname(file).slice(1);
			if (extensionsToGzip.includes(ext)) {
				this.gzipFile(`${dirPath}/${file}`);
			}
		}
	}

	/**
	 * Glob patterns - must be implemented by runtime-specific adapters.
	 */
	abstract glob(patterns: string[], options?: { cwd?: string; ignore?: string[] }): Promise<string[]>;

	/**
	 * Read file async - must be implemented by runtime-specific adapters.
	 */
	abstract readFile(path: string): Promise<string>;

	/**
	 * Hash file - must be implemented by runtime-specific adapters.
	 */
	abstract hash(path: string): string;
}
