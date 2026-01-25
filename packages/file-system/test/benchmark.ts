/**
 * @module @ecopages/file-system/benchmark
 * @description Performance benchmark comparing Bun and Node file system operations.
 * Run with: bun run benchmark
 */

import { bench, run, group } from 'mitata';
import path from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { BunFileSystem } from '../src/adapters/bun';
import { NodeFileSystem } from '../src/adapters/node';

const BENCH_DIR = path.join(import.meta.dir, '.bench-fixtures');
const LARGE_FILE = path.join(BENCH_DIR, 'large.txt');
const SMALL_FILE = path.join(BENCH_DIR, 'small.txt');

mkdirSync(BENCH_DIR, { recursive: true });
for (let i = 0; i < 100; i++) {
	writeFileSync(path.join(BENCH_DIR, `file${i}.ts`), `export const x${i} = ${i};`);
}
writeFileSync(SMALL_FILE, 'Hello World');
writeFileSync(LARGE_FILE, 'x'.repeat(1024 * 1024));

const bunFs = new BunFileSystem();
const nodeFs = new NodeFileSystem();

console.log('\n@ecopages/file-system Benchmark\n');
console.log('Comparing BunFileSystem vs NodeFileSystem\n');

group('glob(**/*.ts) - 100 files', () => {
	bench('BunFileSystem (Bun.Glob)', async () => {
		await bunFs.glob(['**/*.ts'], { cwd: BENCH_DIR });
	});

	bench('NodeFileSystem (fast-glob)', async () => {
		await nodeFs.glob(['**/*.ts'], { cwd: BENCH_DIR });
	});
});

group('readFile (small - 11 bytes)', () => {
	bench('BunFileSystem (Bun.file)', async () => {
		await bunFs.readFile(SMALL_FILE);
	});

	bench('NodeFileSystem (node:fs/promises)', async () => {
		await nodeFs.readFile(SMALL_FILE);
	});
});

group('readFile (large - 1MB)', () => {
	bench('BunFileSystem (Bun.file)', async () => {
		await bunFs.readFile(LARGE_FILE);
	});

	bench('NodeFileSystem (node:fs/promises)', async () => {
		await nodeFs.readFile(LARGE_FILE);
	});
});

group('readFileSync (small)', () => {
	bench('BunFileSystem (node:fs)', () => {
		bunFs.readFileSync(SMALL_FILE);
	});

	bench('NodeFileSystem (node:fs)', () => {
		nodeFs.readFileSync(SMALL_FILE);
	});
});

group('hash (small file)', () => {
	bench('BunFileSystem (Bun.hash)', () => {
		bunFs.hash(SMALL_FILE);
	});

	bench('NodeFileSystem (node:crypto)', () => {
		nodeFs.hash(SMALL_FILE);
	});
});

group('hash (large 1MB file)', () => {
	bench('BunFileSystem (Bun.hash)', () => {
		bunFs.hash(LARGE_FILE);
	});

	bench('NodeFileSystem (node:crypto)', () => {
		nodeFs.hash(LARGE_FILE);
	});
});

group('exists check (sync)', () => {
	bench('BunFileSystem (node:fs)', () => {
		bunFs.exists(SMALL_FILE);
	});

	bench('NodeFileSystem (node:fs)', () => {
		nodeFs.exists(SMALL_FILE);
	});
});

group('exists check (async)', () => {
	bench('BunFileSystem (Bun.file().exists())', async () => {
		await bunFs.existsAsync(SMALL_FILE);
	});

	bench('NodeFileSystem (node:fs/promises access)', async () => {
		await nodeFs.existsAsync(SMALL_FILE);
	});
});

const WRITE_FILE = path.join(BENCH_DIR, 'write-test.txt');
const WRITE_CONTENT_SMALL = 'Hello World';
const WRITE_CONTENT_LARGE = 'x'.repeat(1024 * 1024);

group('writeAsync (small - 11 bytes)', () => {
	bench('BunFileSystem (Bun.write)', async () => {
		await bunFs.writeAsync(WRITE_FILE, WRITE_CONTENT_SMALL);
	});

	bench('NodeFileSystem (node:fs/promises)', async () => {
		await nodeFs.writeAsync(WRITE_FILE, WRITE_CONTENT_SMALL);
	});
});

group('writeAsync (large - 1MB)', () => {
	bench('BunFileSystem (Bun.write)', async () => {
		await bunFs.writeAsync(WRITE_FILE, WRITE_CONTENT_LARGE);
	});

	bench('NodeFileSystem (node:fs/promises)', async () => {
		await nodeFs.writeAsync(WRITE_FILE, WRITE_CONTENT_LARGE);
	});
});

group('copyFileAsync (large - 1MB)', () => {
	const DEST = path.join(BENCH_DIR, 'copy-dest.txt');
	bench('BunFileSystem (Bun.write optimized)', async () => {
		await bunFs.copyFileAsync(LARGE_FILE, DEST);
	});

	bench('NodeFileSystem (node:fs/promises cp)', async () => {
		await nodeFs.copyFileAsync(LARGE_FILE, DEST);
	});
});

await run({ colors: true });

rmSync(BENCH_DIR, { recursive: true, force: true });
console.log('\n√ Benchmark complete\n');
