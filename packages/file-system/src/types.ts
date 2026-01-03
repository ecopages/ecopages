/**
 * @module @ecopages/file-system/types
 * @description Type definitions for runtime-agnostic file system operations.
 */

/**
 * Options for glob pattern matching.
 */
export interface GlobOptions {
	/** Working directory for glob patterns */
	cwd?: string;
	/** Patterns to ignore */
	ignore?: string[];
}

/**
 * Runtime-agnostic file system interface.
 * Implementations exist for Bun (optimized) and Node.js (fallback).
 */
export interface FileSystem {
	/**
	 * Scan the file system for files matching glob patterns.
	 * @param patterns - Glob patterns to match
	 * @param options - Glob options
	 */
	glob(patterns: string[], options?: GlobOptions): Promise<string[]>;

	/**
	 * Read a file as a string asynchronously.
	 * @param path - Path to the file
	 */
	readFile(path: string): Promise<string>;

	/**
	 * Read a file as a string synchronously.
	 * @param path - Path to the file
	 */
	readFileSync(path: string): string;

	/**
	 * Read a file as a Buffer.
	 * @param path - Path to the file
	 */
	readFileAsBuffer(path: string): Buffer;

	/**
	 * Write contents to a file synchronously.
	 * Creates parent directories if they don't exist.
	 * @param filepath - Path to write to
	 * @param contents - Content to write
	 */
	write(filepath: string, contents: string | Buffer): void;

	/**
	 * Write contents to a file asynchronously.
	 * @param filepath - Path to write to
	 * @param contents - Content to write
	 */
	writeAsync(filepath: string, contents: string | Buffer): Promise<void>;

	/**
	 * Ensure a directory exists, optionally cleaning it first.
	 * @param dirPath - Directory path
	 * @param forceCleanup - If true, remove existing directory first
	 */
	ensureDir(dirPath: string, forceCleanup?: boolean): void;

	/**
	 * Copy a directory recursively.
	 * @param source - Source directory
	 * @param destination - Destination directory
	 */
	copyDir(source: string, destination: string): void;

	/**
	 * Remove all contents of a directory.
	 * @param path - Directory path
	 */
	emptyDir(path: string): void;

	/**
	 * Check if a path is a directory.
	 * @param path - Path to check
	 */
	isDirectory(path: string): boolean;

	/**
	 * Check if a file or directory exists.
	 * @param path - Path to check
	 */
	exists(path: string): boolean;

	/**
	 * Copy a file.
	 * @param source - Source file path
	 * @param destination - Destination file path
	 */
	copyFile(source: string, destination: string): void;

	/**
	 * Remove a file or directory synchronously.
	 * @param path - Path to remove
	 */
	remove(path: string): void;

	/**
	 * Remove a file or directory asynchronously.
	 * @param path - Path to remove
	 */
	removeAsync(path: string): Promise<void>;

	/**
	 * Get a hash of a file's contents.
	 * @param path - Path to the file
	 */
	hash(path: string): string;

	/**
	 * Gzip a single file.
	 * @param path - Path to the file
	 */
	gzipFile(path: string): void;

	/**
	 * Gzip all files with specified extensions in a directory.
	 * @param path - Directory path
	 * @param extensions - File extensions to gzip (without dot)
	 */
	gzipDir(path: string, extensions: string[]): void;

	/**
	 * Verify that a file exists, throw FileNotFoundError if not.
	 * @param path - Path to verify
	 * @throws FileNotFoundError
	 */
	verifyFileExists(path: string): void;
}

/**
 * Error thrown when a file is not found.
 */
export class FileNotFoundError extends Error {
	code = 'ENOENT';
	constructor(path: string) {
		super(`File: ${path} not found`);
		this.name = 'FileNotFoundError';
	}
}
