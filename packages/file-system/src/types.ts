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

/** A watched file was added, changed or removed. */
export interface FileChange {
	type: 'add' | 'change' | 'unlink';
	path: string;
}

/** Options for {@link FileSystem.watch}. */
export interface WatchOptions {
	/** Called for each file change after the watcher is ready. */
	onChange: (change: FileChange) => void;
	/** Called when watching fails, for example on a permission or watch-limit error. */
	onError: (error: unknown) => void;
	/**
	 * Returns whether to skip a path.
	 *
	 * @remarks
	 * Tested before a directory is read, so an ignored directory is never descended into.
	 */
	ignored?: (path: string) => boolean;
}

/** A running watch started by {@link FileSystem.watch}. */
export interface FileWatcher {
	/** Resolves once the initial scan is done; every later change is reported. */
	ready: Promise<void>;
	close(): Promise<void>;
}

/**
 * File system interface. `NodeFileSystem` implements it on every runtime.
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
	 * Ensure a directory exists asynchronously, optionally cleaning it first.
	 * @param dirPath - Directory path
	 * @param forceCleanup - If true, remove existing directory first
	 */
	ensureDirAsync(dirPath: string, forceCleanup?: boolean): Promise<void>;

	/**
	 * Copy a directory recursively.
	 * @param source - Source directory
	 * @param destination - Destination directory
	 */
	copyDir(source: string, destination: string): void;

	/**
	 * Copy a directory recursively asynchronously.
	 * @param source - Source directory
	 * @param destination - Destination directory
	 */
	copyDirAsync(source: string, destination: string): Promise<void>;

	/**
	 * Remove all contents of a directory.
	 * @param path - Directory path
	 */
	emptyDir(path: string): void;

	/**
	 * Remove all contents of a directory asynchronously.
	 * @param path - Directory path
	 */
	emptyDirAsync(path: string): Promise<void>;

	/**
	 * Check if a path is a directory.
	 * @param path - Path to check
	 */
	isDirectory(path: string): boolean;

	/**
	 * Check if a path is a directory asynchronously.
	 * @param path - Path to check
	 */
	isDirectoryAsync(path: string): Promise<boolean>;

	/**
	 * Check if a file or directory exists.
	 * @param path - Path to check
	 */
	exists(path: string): boolean;

	/**
	 * Check if a file or directory exists asynchronously.
	 * @param path - Path to check
	 */
	existsAsync(path: string): Promise<boolean>;

	/**
	 * Copy a file.
	 * @param source - Source file path
	 * @param destination - Destination file path
	 */
	copyFile(source: string, destination: string): void;

	/**
	 * Copy a file asynchronously.
	 * @param source - Source file path
	 * @param destination - Destination file path
	 */
	copyFileAsync(source: string, destination: string): Promise<void>;

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

	/**
	 * Watch files and directories recursively.
	 *
	 * @remarks
	 * Files that exist when watching starts are not reported. A path that does not exist yet is
	 * watched for creation. A change is reported once the file has stopped growing, so a partial
	 * save is not seen as a separate change.
	 */
	watch(paths: readonly string[], options: WatchOptions): FileWatcher;
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
