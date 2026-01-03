/**
 * Test suite for @ecopages/fs adapters
 * Tests both BunFileSystem and NodeFileSystem implementations
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import path from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { BunFileSystem } from '../src/adapters/bun';
import { NodeFileSystem } from '../src/adapters/node';
import type { FileSystem } from '../src/types';

const TEST_DIR = path.join(import.meta.dir, '.test-fixtures');

const adapters: [string, FileSystem][] = [
	['BunFileSystem', new BunFileSystem()],
	['NodeFileSystem', new NodeFileSystem()],
];

beforeAll(() => {
	mkdirSync(TEST_DIR, { recursive: true });
	mkdirSync(path.join(TEST_DIR, 'subdir'), { recursive: true });
	writeFileSync(path.join(TEST_DIR, 'test.txt'), 'Hello World');
	writeFileSync(path.join(TEST_DIR, 'test.ts'), 'export const x = 1;');
	writeFileSync(path.join(TEST_DIR, 'subdir', 'nested.ts'), 'export const y = 2;');
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

for (const [name, fs] of adapters) {
	describe(name, () => {
		describe('exists', () => {
			test('returns true for existing file', () => {
				expect(fs.exists(path.join(TEST_DIR, 'test.txt'))).toBe(true);
			});

			test('returns false for non-existing file', () => {
				expect(fs.exists(path.join(TEST_DIR, 'nonexistent.txt'))).toBe(false);
			});
		});

		describe('readFileSync', () => {
			test('reads file content', () => {
				const content = fs.readFileSync(path.join(TEST_DIR, 'test.txt'));
				expect(content).toBe('Hello World');
			});

			test('throws for non-existing file', () => {
				expect(() => fs.readFileSync(path.join(TEST_DIR, 'nonexistent.txt'))).toThrow();
			});
		});

		describe('readFile', () => {
			test('reads file content async', async () => {
				const content = await fs.readFile(path.join(TEST_DIR, 'test.txt'));
				expect(content).toBe('Hello World');
			});
		});

		describe('readFileAsBuffer', () => {
			test('reads file as buffer', () => {
				const buffer = fs.readFileAsBuffer(path.join(TEST_DIR, 'test.txt'));
				expect(Buffer.isBuffer(buffer)).toBe(true);
				expect(buffer.toString()).toBe('Hello World');
			});
		});

		describe('write', () => {
			test('writes file content', () => {
				const filepath = path.join(TEST_DIR, 'write-test.txt');
				fs.write(filepath, 'Test content');
				expect(fs.exists(filepath)).toBe(true);
				expect(fs.readFileSync(filepath)).toBe('Test content');
			});

			test('creates parent directories', () => {
				const filepath = path.join(TEST_DIR, 'new-dir', 'deep', 'file.txt');
				fs.write(filepath, 'Deep content');
				expect(fs.exists(filepath)).toBe(true);
			});
		});

		describe('glob', () => {
			test('finds files by pattern', async () => {
				const files = await fs.glob(['**/*.ts'], { cwd: TEST_DIR });
				expect(files).toContain('test.ts');
				expect(files.some((f) => f.includes('nested.ts'))).toBe(true);
			});

			test('returns empty array for no matches', async () => {
				const files = await fs.glob(['**/*.xyz'], { cwd: TEST_DIR });
				expect(files).toHaveLength(0);
			});
		});

		describe('hash', () => {
			test('returns consistent hash for same content', () => {
				const hash1 = fs.hash(path.join(TEST_DIR, 'test.txt'));
				const hash2 = fs.hash(path.join(TEST_DIR, 'test.txt'));
				expect(hash1).toBe(hash2);
				expect(typeof hash1).toBe('string');
				expect(hash1.length).toBeGreaterThan(0);
			});
		});

		describe('isDirectory', () => {
			test('returns true for directory', () => {
				expect(fs.isDirectory(TEST_DIR)).toBe(true);
			});

			test('returns false for file', () => {
				expect(fs.isDirectory(path.join(TEST_DIR, 'test.txt'))).toBe(false);
			});
		});

		describe('ensureDir', () => {
			test('creates directory if not exists', () => {
				const newDir = path.join(TEST_DIR, 'ensure-dir-test');
				fs.ensureDir(newDir);
				expect(fs.isDirectory(newDir)).toBe(true);
			});

			test('does not throw if directory exists', () => {
				expect(() => fs.ensureDir(TEST_DIR)).not.toThrow();
			});
		});

		describe('copyFile', () => {
			test('copies file', () => {
				const src = path.join(TEST_DIR, 'test.txt');
				const dest = path.join(TEST_DIR, 'test-copy.txt');
				fs.copyFile(src, dest);
				expect(fs.exists(dest)).toBe(true);
				expect(fs.readFileSync(dest)).toBe('Hello World');
			});
		});

		describe('remove', () => {
			test('removes file', () => {
				const filepath = path.join(TEST_DIR, 'to-remove.txt');
				fs.write(filepath, 'temp');
				expect(fs.exists(filepath)).toBe(true);
				fs.remove(filepath);
				expect(fs.exists(filepath)).toBe(false);
			});
		});

		describe('verifyFileExists', () => {
			test('does not throw for existing file', () => {
				expect(() => fs.verifyFileExists(path.join(TEST_DIR, 'test.txt'))).not.toThrow();
			});

			test('throws FileNotFoundError for missing file', () => {
				expect(() => fs.verifyFileExists(path.join(TEST_DIR, 'missing.txt'))).toThrow();
			});
		});
	});
}
