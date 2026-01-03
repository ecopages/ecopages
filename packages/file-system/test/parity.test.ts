/**
 * @module @ecopages/file-system/test/parity
 * @description Parity tests to verify BunFileSystem and NodeFileSystem return identical results.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import path from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { BunFileSystem } from '../src/adapters/bun';
import { NodeFileSystem } from '../src/adapters/node';

const TEST_DIR = path.join(import.meta.dir, '.parity-fixtures');

const bunFs = new BunFileSystem();
const nodeFs = new NodeFileSystem();

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

describe('Adapter Parity', () => {
	describe('exists', () => {
		test('returns same result for existing file', () => {
			const file = path.join(TEST_DIR, 'test.txt');
			expect(bunFs.exists(file)).toBe(nodeFs.exists(file));
		});

		test('returns same result for non-existing file', () => {
			const file = path.join(TEST_DIR, 'nonexistent.txt');
			expect(bunFs.exists(file)).toBe(nodeFs.exists(file));
		});
	});

	describe('readFileSync', () => {
		test('returns identical content', () => {
			const file = path.join(TEST_DIR, 'test.txt');
			expect(bunFs.readFileSync(file)).toBe(nodeFs.readFileSync(file));
		});
	});

	describe('readFile', () => {
		test('returns identical content async', async () => {
			const file = path.join(TEST_DIR, 'test.txt');
			const [bunResult, nodeResult] = await Promise.all([bunFs.readFile(file), nodeFs.readFile(file)]);
			expect(bunResult).toBe(nodeResult);
		});
	});

	describe('readFileAsBuffer', () => {
		test('returns identical buffer', () => {
			const file = path.join(TEST_DIR, 'test.txt');
			const bunBuffer = bunFs.readFileAsBuffer(file);
			const nodeBuffer = nodeFs.readFileAsBuffer(file);
			expect(bunBuffer.equals(nodeBuffer)).toBe(true);
		});
	});

	describe('glob', () => {
		test('finds same files', async () => {
			const [bunFiles, nodeFiles] = await Promise.all([
				bunFs.glob(['**/*.ts'], { cwd: TEST_DIR }),
				nodeFs.glob(['**/*.ts'], { cwd: TEST_DIR }),
			]);
			expect(bunFiles.sort()).toEqual(nodeFiles.sort());
		});

		test('returns same empty array for no matches', async () => {
			const [bunFiles, nodeFiles] = await Promise.all([
				bunFs.glob(['**/*.xyz'], { cwd: TEST_DIR }),
				nodeFs.glob(['**/*.xyz'], { cwd: TEST_DIR }),
			]);
			expect(bunFiles).toEqual(nodeFiles);
		});
	});

	describe('isDirectory', () => {
		test('returns same result for directory', () => {
			expect(bunFs.isDirectory(TEST_DIR)).toBe(nodeFs.isDirectory(TEST_DIR));
		});

		test('returns same result for file', () => {
			const file = path.join(TEST_DIR, 'test.txt');
			expect(bunFs.isDirectory(file)).toBe(nodeFs.isDirectory(file));
		});
	});

	describe('write and read roundtrip', () => {
		test('both adapters can read what the other wrote', () => {
			const bunFile = path.join(TEST_DIR, 'bun-wrote.txt');
			const nodeFile = path.join(TEST_DIR, 'node-wrote.txt');
			const content = 'Cross-adapter test content';

			bunFs.write(bunFile, content);
			nodeFs.write(nodeFile, content);

			expect(nodeFs.readFileSync(bunFile)).toBe(content);
			expect(bunFs.readFileSync(nodeFile)).toBe(content);
		});
	});
});
