/**
 * Contract tests for NodeFileSystem.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { NodeFileSystem } from '../src/adapters/node';
import type { FileSystem } from '../src/types';

let testRoot: string;
let testDir: string;
let testDirCopy: string;

const adapters: [string, FileSystem][] = [['NodeFileSystem', new NodeFileSystem()]];

beforeEach(() => {
	testRoot = mkdtempSync(path.join(os.tmpdir(), 'ecopages-file-system-test-'));
	testDir = path.join(testRoot, 'fixtures');
	testDirCopy = path.join(testRoot, 'fixtures-copy');
	mkdirSync(testDir, { recursive: true });
	mkdirSync(path.join(testDir, 'subdir'), { recursive: true });
	writeFileSync(path.join(testDir, 'test.txt'), 'Hello World');
	writeFileSync(path.join(testDir, 'test.ts'), 'export const x = 1;');
	writeFileSync(path.join(testDir, 'subdir', 'nested.ts'), 'export const y = 2;');
});

afterEach(() => {
	rmSync(testRoot, { recursive: true, force: true });
});

for (const [name, fs] of adapters) {
	describe(name, () => {
		describe('exists', () => {
			test('returns true for existing file', () => {
				expect(fs.exists(path.join(testDir, 'test.txt'))).toBe(true);
			});

			test('returns false for non-existing file', () => {
				expect(fs.exists(path.join(testDir, 'nonexistent.txt'))).toBe(false);
			});
		});

		describe('readFileSync', () => {
			test('reads file content', () => {
				const content = fs.readFileSync(path.join(testDir, 'test.txt'));
				expect(content).toBe('Hello World');
			});

			test('throws for non-existing file', () => {
				expect(() => fs.readFileSync(path.join(testDir, 'nonexistent.txt'))).toThrow();
			});
		});

		describe('readFile', () => {
			test('reads file content async', async () => {
				const content = await fs.readFile(path.join(testDir, 'test.txt'));
				expect(content).toBe('Hello World');
			});
		});

		describe('readFileAsBuffer', () => {
			test('reads file as buffer', () => {
				const buffer = fs.readFileAsBuffer(path.join(testDir, 'test.txt'));
				expect(Buffer.isBuffer(buffer)).toBe(true);
				expect(buffer.toString()).toBe('Hello World');
			});
		});

		describe('write', () => {
			test('writes file content', () => {
				const filepath = path.join(testDir, 'write-test.txt');
				fs.write(filepath, 'Test content');
				expect(fs.exists(filepath)).toBe(true);
				expect(fs.readFileSync(filepath)).toBe('Test content');
			});

			test('creates parent directories', () => {
				const filepath = path.join(testDir, 'new-dir', 'deep', 'file.txt');
				fs.write(filepath, 'Deep content');
				expect(fs.exists(filepath)).toBe(true);
			});
		});

		describe('glob', () => {
			test('finds files by pattern', async () => {
				const files = await fs.glob(['**/*.ts'], { cwd: testDir });
				expect(files).toContain('test.ts');
				expect(files.some((f) => f.includes('nested.ts'))).toBe(true);
			});

			test('returns empty array for no matches', async () => {
				const files = await fs.glob(['**/*.xyz'], { cwd: testDir });
				expect(files).toHaveLength(0);
			});

			test('respects ignore patterns', async () => {
				const files = await fs.glob(['**/*.ts'], { cwd: testDir, ignore: ['**/nested.ts'] });
				expect(files).toContain('test.ts');
				expect(files.some((f) => f.includes('nested.ts'))).toBe(false);
			});

			test('respects multiple ignore patterns', async () => {
				const files = await fs.glob(['**/*.ts'], { cwd: testDir, ignore: ['test.ts', '**/nested.ts'] });
				expect(files).toHaveLength(0);
			});
		});

		describe('hash', () => {
			test('hashes by content, not by path', () => {
				const duplicate = path.join(testDir, 'duplicate.txt');
				fs.write(duplicate, 'Hello World');

				expect(fs.hash(duplicate)).toBe(fs.hash(path.join(testDir, 'test.txt')));
				expect(fs.hash(path.join(testDir, 'test.ts'))).not.toBe(fs.hash(path.join(testDir, 'test.txt')));
			});
		});

		describe('isDirectory', () => {
			test('returns true for directory', () => {
				expect(fs.isDirectory(testDir)).toBe(true);
			});

			test('returns false for file', () => {
				expect(fs.isDirectory(path.join(testDir, 'test.txt'))).toBe(false);
			});
		});

		describe('ensureDir', () => {
			test('creates directory if not exists', () => {
				const newDir = path.join(testDir, 'ensure-dir-test');
				fs.ensureDir(newDir);
				expect(fs.isDirectory(newDir)).toBe(true);
			});

			test('does not throw if directory exists', () => {
				expect(() => fs.ensureDir(testDir)).not.toThrow();
			});
		});

		describe('copyFile', () => {
			test('copies file', () => {
				const src = path.join(testDir, 'test.txt');
				const dest = path.join(testDir, 'test-copy.txt');
				fs.copyFile(src, dest);
				expect(fs.exists(dest)).toBe(true);
				expect(fs.readFileSync(dest)).toBe('Hello World');
			});
		});

		describe('remove', () => {
			test('removes file', () => {
				const filepath = path.join(testDir, 'to-remove.txt');
				fs.write(filepath, 'temp');
				expect(fs.exists(filepath)).toBe(true);
				fs.remove(filepath);
				expect(fs.exists(filepath)).toBe(false);
			});
		});

		describe('existsAsync', () => {
			test('returns true for existing file', async () => {
				expect(await fs.existsAsync(path.join(testDir, 'test.txt'))).toBe(true);
			});

			test('returns false for non-existing file', async () => {
				expect(await fs.existsAsync(path.join(testDir, 'nonexistent.txt'))).toBe(false);
			});
		});

		describe('isDirectoryAsync', () => {
			test('returns true for directory', async () => {
				expect(await fs.isDirectoryAsync(testDir)).toBe(true);
			});

			test('returns false for file', async () => {
				expect(await fs.isDirectoryAsync(path.join(testDir, 'test.txt'))).toBe(false);
			});
		});

		describe('copyFileAsync', () => {
			test('copies file async', async () => {
				const src = path.join(testDir, 'test.txt');
				const dest = path.join(testDir, 'test-copy-async.txt');
				await fs.copyFileAsync(src, dest);
				expect(await fs.existsAsync(dest)).toBe(true);
				expect(fs.readFileSync(dest)).toBe('Hello World');
			});
		});

		describe('ensureDirAsync', () => {
			test('creates directory if not exists', async () => {
				const newDir = path.join(testDir, 'ensure-dir-async-test');
				await fs.ensureDirAsync(newDir);
				expect(await fs.isDirectoryAsync(newDir)).toBe(true);
			});

			test('does not throw if directory exists', async () => {
				await expect(fs.ensureDirAsync(testDir)).resolves.toBeUndefined();
			});
		});

		describe('copyDirAsync', () => {
			test('copies directory recursively', async () => {
				await fs.copyDirAsync(testDir, testDirCopy);
				expect(await fs.existsAsync(path.join(testDirCopy, 'test.txt'))).toBe(true);
				expect(await fs.existsAsync(path.join(testDirCopy, 'subdir', 'nested.ts'))).toBe(true);
			});
		});

		describe('emptyDir', () => {
			test('removes directory contents but keeps directory', () => {
				const dir = path.join(testDir, 'empty-test-sync');
				fs.ensureDir(dir);
				fs.write(path.join(dir, 'temp.txt'), 'temp');
				expect(fs.exists(path.join(dir, 'temp.txt'))).toBe(true);
				fs.emptyDir(dir);
				expect(fs.isDirectory(dir)).toBe(true);
				expect(fs.exists(path.join(dir, 'temp.txt'))).toBe(false);
			});
		});

		describe('emptyDirAsync', () => {
			test('removes directory contents but keeps directory', async () => {
				const dir = path.join(testDir, 'empty-test');
				await fs.ensureDirAsync(dir);
				await fs.writeAsync(path.join(dir, 'temp.txt'), 'temp');
				expect(await fs.existsAsync(path.join(dir, 'temp.txt'))).toBe(true);
				await fs.emptyDirAsync(dir);
				expect(await fs.isDirectoryAsync(dir)).toBe(true);
				expect(await fs.existsAsync(path.join(dir, 'temp.txt'))).toBe(false);
			});
		});

		describe('verifyFileExists', () => {
			test('does not throw for existing file', () => {
				expect(() => fs.verifyFileExists(path.join(testDir, 'test.txt'))).not.toThrow();
			});

			test('throws FileNotFoundError for missing file', () => {
				expect(() => fs.verifyFileExists(path.join(testDir, 'missing.txt'))).toThrow();
			});
		});
	});
}
