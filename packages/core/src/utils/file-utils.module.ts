/**
 * This module contains utility functions for file operations.
 * @module
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import zlib from 'node:zlib';
import type { GlobScanOptions } from 'bun';

/**
 * Copy a directory synchronously.
 * @param source
 * @param destination
 */
function copyDirSync(source: string, destination: string) {
  cpSync(source, destination, { recursive: true });
}

/**
 * Ensure that a directory exists.
 * @param path
 * @param forceCleanup
 */
function ensureDirectoryExists(path: string, forceCleanup?: boolean): void {
  if (existsSync(path)) {
    if (forceCleanup) {
      rmdirSync(path, {
        recursive: true,
      });

      mkdirSync(path, { recursive: true });

      return;
    }
  } else {
    mkdirSync(path, { recursive: true });
  }
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
 * @param path
 * @param contents
 */
function write(path: string, contents: string | Buffer): void {
  try {
    const dirs = path.split('/');
    let currentPath = '';
    for (let i = 0; i < dirs.length - 1; i++) {
      currentPath += `${dirs[i]}/`;
      if (!existsSync(currentPath)) {
        mkdirSync(currentPath);
      }
    }
    writeFileSync(path, contents);
  } catch (error) {
    throw new Error(`[ecopages] Error writing file: ${path}`);
  }
}

function getFileHash(path: string): string {
  try {
    const buffer = getFileAsBuffer(path);
    return Bun.hash(buffer).toString();
  } catch (error) {
    throw new Error(`[ecopages] Error hashing file: ${path}`);
  }
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
  gzipDirSync,
  gzipFileSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  getFileHash,
  rmSync,
};
