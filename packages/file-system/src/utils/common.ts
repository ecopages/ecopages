/**
 * @module @ecopages/file-system/utils/common
 * @description Shared utilities used by both Bun and Node adapters.
 */

import {
	cpSync,
	type Dirent,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	type Stats,
	writeFileSync,
} from 'node:fs';
import { cp as cpAsync, mkdir as mkdirAsync, readdir, rm as rmAsync, stat as statAsync } from 'node:fs/promises';
import { dirname, extname, join as pathJoin, relative } from 'node:path';
import zlib from 'node:zlib';
import {
	type DirectoryEntry,
	FileNotFoundError,
	type FileStats,
	type GlobOptions,
	type ReaddirOptions,
} from '../types.ts';

function toFileStats(stats: Stats): FileStats {
	return {
		isFile: stats.isFile(),
		isDirectory: stats.isDirectory(),
		isSymbolicLink: stats.isSymbolicLink(),
		size: stats.size,
	};
}

function toDirectoryEntry(dirPath: string, entry: Dirent): DirectoryEntry {
	return {
		name: relative(dirPath, pathJoin(entry.parentPath, entry.name)),
		isFile: entry.isFile(),
		isDirectory: entry.isDirectory(),
		isSymbolicLink: entry.isSymbolicLink(),
	};
}

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
		if (!this.exists(filePath)) {
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
			this.ensureDir(dirname(filepath));
			writeFileSync(filepath, contents);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error writing file: ${filepath}. Cause: ${message}`, { cause: error });
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
	 * Ensure a directory exists asynchronously.
	 */
	async ensureDirAsync(dirPath: string, forceCleanup?: boolean): Promise<void> {
		if (forceCleanup && (await this.existsAsync(dirPath))) {
			await rmAsync(dirPath, { recursive: true, force: true });
		}
		await mkdirAsync(dirPath, { recursive: true });
	}

	/**
	 * Copy a directory recursively.
	 */
	copyDir(source: string, destination: string): void {
		cpSync(source, destination, { recursive: true });
	}

	/**
	 * Copy a directory recursively asynchronously.
	 */
	async copyDirAsync(source: string, destination: string): Promise<void> {
		await cpAsync(source, destination, { recursive: true });
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
		if (!this.isDirectory(dirPath)) {
			return;
		}
		const entries = readdirSync(dirPath);
		for (const entry of entries) {
			const fullPath = pathJoin(dirPath, entry);
			rmSync(fullPath, { recursive: true, force: true });
		}
	}

	/**
	 * Remove a directory's contents asynchronously.
	 */
	async emptyDirAsync(dirPath: string): Promise<void> {
		if (!(await this.isDirectoryAsync(dirPath))) {
			return;
		}
		const entries = await readdir(dirPath);
		await Promise.all(entries.map((entry) => rmAsync(pathJoin(dirPath, entry), { recursive: true, force: true })));
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
	 * Resolve a path to its canonical absolute form, following symbolic links.
	 */
	realpath(filePath: string): string {
		return realpathSync(filePath);
	}

	stat(filePath: string): FileStats {
		return toFileStats(statSync(filePath));
	}

	lstat(filePath: string): FileStats {
		return toFileStats(lstatSync(filePath));
	}

	readdir(dirPath: string, options: ReaddirOptions = {}): DirectoryEntry[] {
		return readdirSync(dirPath, { recursive: options.recursive, withFileTypes: true }).map((entry) =>
			toDirectoryEntry(dirPath, entry),
		);
	}

	readlink(filePath: string): string {
		return readlinkSync(filePath);
	}

	mkdtemp(prefix: string): string {
		return mkdtempSync(prefix);
	}

	rename(source: string, destination: string): void {
		renameSync(source, destination);
	}

	/**
	 * Check if a path is a directory asynchronously.
	 */
	async isDirectoryAsync(filePath: string): Promise<boolean> {
		try {
			const stats = await statAsync(filePath);
			return stats.isDirectory();
		} catch {
			return false;
		}
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
		const entries = readdirSync(dirPath, { recursive: true, withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				const ext = extname(entry.name).slice(1);
				if (extensionsToGzip.includes(ext)) {
					this.gzipFile(pathJoin(entry.parentPath, entry.name));
				}
			}
		}
	}

	/**
	 * Glob patterns - must be implemented by runtime-specific adapters.
	 */
	abstract glob(patterns: string[], options?: GlobOptions): Promise<string[]>;

	/**
	 * Read file async - must be implemented by runtime-specific adapters.
	 */
	abstract readFile(path: string): Promise<string>;

	/**
	 * Write file async - must be implemented by runtime-specific adapters.
	 */
	abstract writeAsync(filepath: string, contents: string | Buffer): Promise<void>;

	/**
	 * Check if a file exists asynchronously - must be implemented by runtime-specific adapters.
	 */
	abstract existsAsync(filePath: string): Promise<boolean>;

	/**
	 * Copy a file asynchronously - must be implemented by runtime-specific adapters.
	 */
	abstract copyFileAsync(source: string, destination: string): Promise<void>;

	/**
	 * Hash file - must be implemented by runtime-specific adapters.
	 */
	abstract hash(path: string): string;
}
