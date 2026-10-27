import type { FileSystem, FileWatcher, GlobOptions, ReaddirOptions, WatchOptions } from './types.ts';

function recordString(recorded: string[], value: unknown): void {
	if (typeof value === 'string' && value.length > 0) {
		recorded.push(value);
	}
}

function recordCwd(recorded: string[], options: GlobOptions | undefined): void {
	recordString(recorded, options?.cwd);
}

/**
 * A {@link FileSystem} that records every path argument, then forwards to `inner`.
 */
export type RecordingFileSystem = FileSystem & {
	readonly recordedPaths: readonly string[];
};

/**
 * Wraps `inner` and records path arguments passed to each method.
 *
 * @remarks
 * Glob patterns are not recorded; the glob `cwd` is. Copy, rename and watch
 * record every path they receive.
 */
export function createRecordingFileSystem(inner: FileSystem): RecordingFileSystem {
	const recorded: string[] = [];

	const recording: RecordingFileSystem = {
		get recordedPaths() {
			return recorded;
		},
		glob: (patterns, options) => {
			recordCwd(recorded, options);
			return inner.glob(patterns, options);
		},
		readFile: (path) => {
			recordString(recorded, path);
			return inner.readFile(path);
		},
		readFileSync: (path) => {
			recordString(recorded, path);
			return inner.readFileSync(path);
		},
		readFileAsBuffer: (path) => {
			recordString(recorded, path);
			return inner.readFileAsBuffer(path);
		},
		write: (filepath, contents) => {
			recordString(recorded, filepath);
			inner.write(filepath, contents);
		},
		writeAsync: (filepath, contents) => {
			recordString(recorded, filepath);
			return inner.writeAsync(filepath, contents);
		},
		ensureDir: (dirPath, forceCleanup) => {
			recordString(recorded, dirPath);
			inner.ensureDir(dirPath, forceCleanup);
		},
		ensureDirAsync: (dirPath, forceCleanup) => {
			recordString(recorded, dirPath);
			return inner.ensureDirAsync(dirPath, forceCleanup);
		},
		copyDir: (source, destination) => {
			recordString(recorded, source);
			recordString(recorded, destination);
			inner.copyDir(source, destination);
		},
		copyDirAsync: (source, destination) => {
			recordString(recorded, source);
			recordString(recorded, destination);
			return inner.copyDirAsync(source, destination);
		},
		emptyDir: (path) => {
			recordString(recorded, path);
			inner.emptyDir(path);
		},
		emptyDirAsync: (path) => {
			recordString(recorded, path);
			return inner.emptyDirAsync(path);
		},
		isDirectory: (path) => {
			recordString(recorded, path);
			return inner.isDirectory(path);
		},
		realpath: (path) => {
			recordString(recorded, path);
			return inner.realpath(path);
		},
		stat: (path) => {
			recordString(recorded, path);
			return inner.stat(path);
		},
		lstat: (path) => {
			recordString(recorded, path);
			return inner.lstat(path);
		},
		readdir: (path: string, options?: ReaddirOptions) => {
			recordString(recorded, path);
			return inner.readdir(path, options);
		},
		readlink: (path) => {
			recordString(recorded, path);
			return inner.readlink(path);
		},
		mkdtemp: (prefix) => {
			recordString(recorded, prefix);
			return inner.mkdtemp(prefix);
		},
		rename: (source, destination) => {
			recordString(recorded, source);
			recordString(recorded, destination);
			inner.rename(source, destination);
		},
		isDirectoryAsync: (path) => {
			recordString(recorded, path);
			return inner.isDirectoryAsync(path);
		},
		exists: (path) => {
			recordString(recorded, path);
			return inner.exists(path);
		},
		existsAsync: (path) => {
			recordString(recorded, path);
			return inner.existsAsync(path);
		},
		copyFile: (source, destination) => {
			recordString(recorded, source);
			recordString(recorded, destination);
			inner.copyFile(source, destination);
		},
		copyFileAsync: (source, destination) => {
			recordString(recorded, source);
			recordString(recorded, destination);
			return inner.copyFileAsync(source, destination);
		},
		remove: (path) => {
			recordString(recorded, path);
			inner.remove(path);
		},
		removeAsync: (path) => {
			recordString(recorded, path);
			return inner.removeAsync(path);
		},
		hash: (path) => {
			recordString(recorded, path);
			return inner.hash(path);
		},
		gzipFile: (path) => {
			recordString(recorded, path);
			inner.gzipFile(path);
		},
		gzipDir: (path, extensions) => {
			recordString(recorded, path);
			inner.gzipDir(path, extensions);
		},
		verifyFileExists: (path) => {
			recordString(recorded, path);
			inner.verifyFileExists(path);
		},
		watch: (paths: readonly string[], options: WatchOptions): FileWatcher => {
			for (const watchPath of paths) recordString(recorded, watchPath);
			return inner.watch(paths, options);
		},
	};

	return recording;
}
