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
function copyDirSync(source: string, destination: string) {
	cpSync(source, destination, { recursive: true });
}

function copyFileSync(source: string, destination: string) {
	cpSync(source, destination);
}

/**
 * Ensure that a directory exists.
 * @param path
 * @param forceCleanup
 */
function ensureDirectoryExists(dirPath: string, forceCleanup?: boolean): void {
	if (forceCleanup && existsSync(dirPath)) {
		rmSync(dirPath, { recursive: true, force: true });
	}

	mkdirSync(dirPath, { recursive: true });
}

/**
 * Verify that a file exists.
 * @param path
 * @throws Error
 */
function verifyFileExists(path: string): void {
	if (!existsSync(path)) {
		throw new Error(`File: ${path} not found`);
	}
}

/**
 * Read a file and return its contents as a buffer.
 * @param path
 * @returns
 */
function getFileAsBuffer(path: string): Buffer {
	try {
		verifyFileExists(path);
		return readFileSync(path);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
	}
}

async function getFileAsString(path: string): Promise<string> {
	try {
		verifyFileExists(path);
		return Bun.file(path).text();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
	}
}

/**
 * Scan the file system for files that match the given pattern.
 * @param pattern
 * @param scanOptions
 * @returns
 */
async function glob(
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
 * Gzip a file.
 * @param path
 */
function gzipFileSync(path: string) {
	const data = getFileAsBuffer(path);
	const compressedData = zlib.gzipSync(Buffer.from(data));
	const gzipFile = `${path}.gz`;
	writeFileSync(gzipFile, compressedData);
}

/**
 * Gzip all files in a directory.
 * @param path
 * @param extensionsToGzip
 */
function gzipDirSync(path: string, extensionsToGzip: string[]) {
	const files = readdirSync(path, { recursive: true });
	for (const file of files) {
		const ext = extname(file as string).slice(1);
		if (extensionsToGzip.includes(ext)) gzipFileSync(`${path}/${file}`);
	}
}

/**
 * Write contents to a file.
 * @param filepath
 * @param contents
 */
function write(filepath: string, contents: string | Buffer): void {
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
		appLogger.error(error as Error);
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`[ecopages] Error writing file: ${path}. Cause: ${message}`);
	}
}

/**
 * Get the hash of a file.
 * @param path
 * @returns
 */
function getFileHash(path: string): string {
	try {
		const buffer = getFileAsBuffer(path);
		return Bun.hash(buffer).toString();
	} catch (error) {
		appLogger.error(error as Error);
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`[ecopages] Error hashing file: ${path}. Cause: ${message}`);
	}
}

/**
 * Implement the synchronous version of `rm -rf`.
 * @param path
 */
function emptyDirSync(path: string) {
	rmSync(path, {
		recursive: true,
		force: true,
	});
}

function isDirectory(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Utility functions for file operations.
 */
export const FileUtils = {
	glob,
	getFileAsBuffer,
	existsSync,
	write,
	verifyFileExists,
	ensureDirectoryExists,
	copyDirSync,
	copyFileSync,
	gzipDirSync,
	gzipFileSync,
	writeFileSync,
	readFileSync,
	readdirSync,
	isDirectory,
	mkdirSync,
	getFileHash,
	rmSync,
	emptyDirSync,
	getFileAsString,
	rmAsync,
	rmdirAsync,
	rmdirSync,
	mkdir,
	writeFile,
};
