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

/** A watched file or directory changed, or a native notification requires a root rescan. */
export interface FileChange {
	type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'rescan';
	path: string;
}

/** Options for {@link FileSystem.watch}. */
export interface WatchOptions {
	/** Called after `watcher.ready` for each file or directory change; filename-less native events can produce rescans for mapped roots. */
	onChange: (change: FileChange) => void;
	/** Called when watching fails, for example on a permission or watch-limit error. */
	onError: (error: unknown) => void;
	/**
	 * Returns whether to skip a path and, when available, its current stats.
	 *
	 * @remarks
	 * Tested before a directory is read, so ignored subdirectories are skipped during initial indexing.
	 */
	ignored?: (path: string, stats?: FileStats) => boolean;
}

/** A running watch started by {@link FileSystem.watch}. */
export interface FileWatcher {
	/** Resolves once the watch roots are open and existing paths are indexed; existing entries are not reported. */
	ready: Promise<void>;
	/** Adds paths to the running subscription and indexes their existing entries without reporting them. */
	add(paths: readonly string[]): Promise<void>;
	close(): Promise<void>;
}

/** What kind of entry a path is, and its size in bytes. */
export interface FileStats {
	isFile: boolean;
	isDirectory: boolean;
	isSymbolicLink: boolean;
	size: number;
}

/** An entry returned by {@link FileSystem.readdir}. */
export interface DirectoryEntry {
	/** Path relative to the directory that was read, so it can include subdirectories when read recursively. */
	name: string;
	isFile: boolean;
	isDirectory: boolean;
	isSymbolicLink: boolean;
}

/** Options for {@link FileSystem.readdir}. */
export interface ReaddirOptions {
	/** List the entries of every subdirectory too. Symbolic links to directories are not followed. */
	recursive?: boolean;
}

/**
 * File system interface. `NodeFileSystem` implements it on every runtime.
 *
 * @remarks
 * `stat`, `lstat`, `readdir`, `readlink`, `mkdtemp` and `rename` throw the Node error unchanged, so
 * callers can branch on its `code` (for example `ENOENT`).
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
	 * Resolve a path to its canonical absolute form, following symbolic links.
	 * @param path - Path to resolve
	 * @throws If the path does not exist
	 */
	realpath(path: string): string;

	/**
	 * Describe a path, following symbolic links.
	 * @throws If the path does not exist
	 */
	stat(path: string): FileStats;

	/**
	 * Describe a path without following a symbolic link at the end of it.
	 * @throws If the path does not exist
	 */
	lstat(path: string): FileStats;

	/**
	 * List the entries of a directory, in the order the operating system returns them.
	 * @throws If the directory does not exist
	 */
	readdir(path: string, options?: ReaddirOptions): DirectoryEntry[];

	/**
	 * Read the target of a symbolic link as stored, without resolving it.
	 * @throws If the path does not exist or is not a symbolic link
	 */
	readlink(path: string): string;

	/**
	 * Create a uniquely named directory and return its path.
	 * @param prefix - Path prefix; six random characters are appended to it
	 */
	mkdtemp(prefix: string): string;

	/**
	 * Move a file or directory in one step, replacing an existing file at the destination.
	 * @throws If the source does not exist
	 */
	rename(source: string, destination: string): void;

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
	 * Watch files and directories, recursively for directory roots.
	 *
	 * @remarks
	 * Existing entries are indexed before `ready`, but are not reported. A path that does not exist yet is watched
	 * from its nearest existing parent. Rapid native events for one path are coalesced into one change.
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
