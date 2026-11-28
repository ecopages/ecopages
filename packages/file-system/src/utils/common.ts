/**
 * @module @ecopages/file-system/utils/common
 * @description Shared utilities used by both Bun and Node adapters.
 */

import {
	closeSync,
	cpSync,
	type Dirent,
	existsSync,
	fstatSync,
	linkSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	readSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	type Stats,
	writeFileSync,
	writeSync,
} from 'node:fs';
import {
	cp as cpAsync,
	type FileHandle,
	link as linkAsync,
	lstat as lstatAsync,
	mkdir as mkdirAsync,
	open as openAsync,
	readdir,
	rm as rmAsync,
	stat as statAsync,
} from 'node:fs/promises';
import { path } from '../path.ts';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';
import {
	type DirectoryEntry,
	FileNotFoundError,
	type FileStats,
	type GlobOptions,
	type ReaddirOptions,
} from '../types.ts';

function errorCodeOf(error: unknown): string | undefined {
	return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

/** True for the error `link(2)` and an exclusive copy raise when the destination exists, which `linkNew` reports as `false`. */
function isAlreadyExistsError(error: unknown): boolean {
	return errorCodeOf(error) === 'EEXIST';
}

/**
 * The errors of a link that cannot be made: `EPERM` (FAT and exFAT on macOS and Linux, some network
 * shares), `EXDEV` (the paths are on two volumes), `EISDIR` (exFAT on Windows), `ENOTSUP`, `EOPNOTSUPP` and `ENOSYS`.
 */
const HARD_LINK_UNSUPPORTED_ERRORS: ReadonlySet<string> = new Set([
	'EPERM',
	'EXDEV',
	'EISDIR',
	'ENOTSUP',
	'EOPNOTSUPP',
	'ENOSYS',
]);

/** True when `error` says the volume has no hard links and `source` can still be installed by copying it. */
function isHardLinkUnsupportedError(error: unknown): boolean {
	const code = errorCodeOf(error);
	return code !== undefined && HARD_LINK_UNSUPPORTED_ERRORS.has(code);
}

const COPY_CHUNK_BYTES = 64 * 1024;

/**
 * Copies `source` to a `destination` that this call creates, and says whether it did.
 *
 * @remarks
 * `copyFile` with `COPYFILE_EXCL` unlinks the destination by path when the copy fails, which would delete another
 * process's file if that process replaced the half-written destination meanwhile. Here a failed copy removes the
 * destination only while it is still the file this call created. A missing source fails before anything is created.
 * The check and the removal are two calls, because no portable call removes a path by inode, so a file renamed over
 * the destination in the instants between them is still lost; that needs a failed write and a rename inside one
 * window, on a volume without hard links.
 */
function copyExclusiveSync(source: string, destination: string): boolean {
	const sourceFd = openSync(source, 'r');
	try {
		let destinationFd: number;
		try {
			destinationFd = openSync(destination, 'wx', fstatSync(sourceFd).mode & 0o777);
		} catch (error) {
			if (isAlreadyExistsError(error)) return false;
			throw error;
		}
		try {
			const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
			for (let read = readSync(sourceFd, chunk); read > 0; read = readSync(sourceFd, chunk)) {
				for (let written = 0; written < read;)
					written += writeSync(destinationFd, chunk, written, read - written);
			}
			return true;
		} catch (error) {
			const created = fstatSync(destinationFd);
			const current = lstatSync(destination, { throwIfNoEntry: false });
			if (current && current.dev === created.dev && current.ino === created.ino)
				rmSync(destination, { force: true });
			throw error;
		} finally {
			closeSync(destinationFd);
		}
	} finally {
		closeSync(sourceFd);
	}
}

/** Asynchronous {@link copyExclusiveSync}. */
async function copyExclusive(source: string, destination: string): Promise<boolean> {
	const sourceHandle = await openAsync(source, 'r');
	try {
		let destinationHandle: FileHandle;
		try {
			destinationHandle = await openAsync(destination, 'wx', (await sourceHandle.stat()).mode & 0o777);
		} catch (error) {
			if (isAlreadyExistsError(error)) return false;
			throw error;
		}
		try {
			const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
			for (
				let { bytesRead } = await sourceHandle.read(chunk, 0, chunk.length, null);
				bytesRead > 0;
				{ bytesRead } = await sourceHandle.read(chunk, 0, chunk.length, null)
			) {
				for (let written = 0; written < bytesRead;)
					written += (await destinationHandle.write(chunk, written, bytesRead - written)).bytesWritten;
			}
			return true;
		} catch (error) {
			const created = await destinationHandle.stat();
			const current = await lstatAsync(destination).catch(() => undefined);
			if (current && current.dev === created.dev && current.ino === created.ino)
				await rmAsync(destination, { force: true });
			throw error;
		} finally {
			await destinationHandle.close();
		}
	} finally {
		await sourceHandle.close();
	}
}

function toFileStats(stats: Stats): FileStats {
	return {
		isFile: stats.isFile(),
		isDirectory: stats.isDirectory(),
		isSymbolicLink: stats.isSymbolicLink(),
		size: stats.size,
		mtimeMs: stats.mtimeMs,
	};
}

function toDirectoryEntry(dirPath: string, entry: Dirent): DirectoryEntry {
	return {
		name: path.relative(dirPath, path.join(entry.parentPath, entry.name)),
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
			this.ensureDir(path.dirname(filepath));
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
			const fullPath = path.join(dirPath, entry);
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
		await Promise.all(entries.map((entry) => rmAsync(path.join(dirPath, entry), { recursive: true, force: true })));
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
		return path.fromNative(realpathSync(filePath));
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
		return path.fromNative(readlinkSync(filePath));
	}

	mkdtemp(prefix: string): string {
		return path.fromNative(mkdtempSync(prefix));
	}

	tempDir(): string {
		return path.fromNative(tmpdir());
	}

	rename(source: string, destination: string): void {
		renameSync(source, destination);
	}

	linkNew(source: string, destination: string): boolean {
		try {
			linkSync(source, destination);
			return true;
		} catch (error) {
			if (isAlreadyExistsError(error)) return false;
			if (!isHardLinkUnsupportedError(error)) throw error;
		}
		return copyExclusiveSync(source, destination);
	}

	async linkNewAsync(source: string, destination: string): Promise<boolean> {
		try {
			await linkAsync(source, destination);
			return true;
		} catch (error) {
			if (isAlreadyExistsError(error)) return false;
			if (!isHardLinkUnsupportedError(error)) throw error;
		}
		return copyExclusive(source, destination);
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
				const ext = path.extname(entry.name).slice(1);
				if (extensionsToGzip.includes(ext)) {
					this.gzipFile(path.join(entry.parentPath, entry.name));
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
	abstract readFile(filePath: string): Promise<string>;

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
	abstract hash(filePath: string): string;
}
