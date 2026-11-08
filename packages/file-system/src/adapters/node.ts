/**
 * @module @ecopages/file-system/adapters/node
 * @description Node.js file system adapter using node:fs/promises.glob(), crypto, and node:fs.
 */

import crypto from 'node:crypto';
import {
	access as accessAsync,
	cp as cpAsync,
	glob as globAsync,
	readFile as readFileAsync,
	writeFile as writeFileAsync,
} from 'node:fs/promises';
import { path } from '../path.ts';
import type { FileSystem, FileWatcher, GlobOptions, WatchOptions } from '../types.ts';
import { BaseFileSystem } from '../utils/common.ts';
import { RecursiveFileWatcher } from './recursive-file-watcher.ts';

async function collectGlobMatches(pattern: string, options: GlobOptions): Promise<string[]> {
	const matches: string[] = [];

	for await (const entry of globAsync(pattern, {
		cwd: options.cwd ?? path.cwd(),
		exclude: options.ignore,
	})) {
		matches.push(path.fromNative(entry));
	}

	return matches;
}

/**
 * Node.js implementation of the FileSystem interface.
 */
export class NodeFileSystem extends BaseFileSystem implements FileSystem {
	async existsAsync(filePath: string): Promise<boolean> {
		try {
			await accessAsync(filePath);
			return true;
		} catch {
			return false;
		}
	}

	async readFile(filePath: string): Promise<string> {
		try {
			this.verifyFileExists(filePath);
			return await readFileAsync(filePath, 'utf-8');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error reading file: ${filePath}, ${message}`);
		}
	}

	async writeAsync(filepath: string, contents: string | Buffer): Promise<void> {
		try {
			await this.ensureDirAsync(path.dirname(filepath));
			await writeFileAsync(filepath, contents);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error writing file: ${filepath}. Cause: ${message}`, { cause: error });
		}
	}

	async copyFileAsync(source: string, destination: string): Promise<void> {
		await cpAsync(source, destination);
	}

	async glob(patterns: string[], options: GlobOptions = {}): Promise<string[]> {
		const files = await Promise.all(patterns.map((pattern) => collectGlobMatches(pattern, options)));
		return Array.from(new Set(files.flat()));
	}

	watch(paths: readonly string[], options: WatchOptions): FileWatcher {
		return new RecursiveFileWatcher(paths, options);
	}

	hash(filePath: string): string {
		try {
			const buffer = this.readFileAsBuffer(filePath);
			return crypto.createHash('sha256').update(buffer).digest('hex');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Error hashing file: ${filePath}. Cause: ${message}`);
		}
	}
}

/**
 * Singleton instance for Node.js runtime.
 */
export const nodeFs: NodeFileSystem = new NodeFileSystem();
