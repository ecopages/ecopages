import type { FileSystem } from './types.ts';
import { nodeFs } from './adapters/node.ts';

let current: FileSystem = nodeFs;

function target(): FileSystem {
	return current;
}

/**
 * Process-wide file system. Tests replace it with {@link installFileSystem}.
 */
export const fileSystem: FileSystem = {
	glob: (patterns, options) => target().glob(patterns, options),
	readFile: (path) => target().readFile(path),
	readFileSync: (path) => target().readFileSync(path),
	readFileAsBuffer: (path) => target().readFileAsBuffer(path),
	write: (filepath, contents) => target().write(filepath, contents),
	writeAsync: (filepath, contents) => target().writeAsync(filepath, contents),
	ensureDir: (dirPath, forceCleanup) => target().ensureDir(dirPath, forceCleanup),
	ensureDirAsync: (dirPath, forceCleanup) => target().ensureDirAsync(dirPath, forceCleanup),
	copyDir: (source, destination) => target().copyDir(source, destination),
	copyDirAsync: (source, destination) => target().copyDirAsync(source, destination),
	emptyDir: (path) => target().emptyDir(path),
	emptyDirAsync: (path) => target().emptyDirAsync(path),
	isDirectory: (path) => target().isDirectory(path),
	realpath: (path) => target().realpath(path),
	stat: (path) => target().stat(path),
	lstat: (path) => target().lstat(path),
	readdir: (path, options) => target().readdir(path, options),
	readlink: (path) => target().readlink(path),
	mkdtemp: (prefix) => target().mkdtemp(prefix),
	rename: (source, destination) => target().rename(source, destination),
	isDirectoryAsync: (path) => target().isDirectoryAsync(path),
	exists: (path) => target().exists(path),
	existsAsync: (path) => target().existsAsync(path),
	copyFile: (source, destination) => target().copyFile(source, destination),
	copyFileAsync: (source, destination) => target().copyFileAsync(source, destination),
	remove: (path) => target().remove(path),
	removeAsync: (path) => target().removeAsync(path),
	hash: (path) => target().hash(path),
	gzipFile: (path) => target().gzipFile(path),
	gzipDir: (path, extensions) => target().gzipDir(path, extensions),
	verifyFileExists: (path) => target().verifyFileExists(path),
	watch: (paths, options) => target().watch(paths, options),
};

/**
 * Replaces {@link fileSystem} until the returned function runs.
 *
 * @remarks
 * Pair with {@link createRecordingFileSystem} in tests that need to observe
 * every path the process reads or writes.
 */
export function installFileSystem(next: FileSystem): () => void {
	const previous = current;
	current = next;
	return () => {
		current = previous;
	};
}
