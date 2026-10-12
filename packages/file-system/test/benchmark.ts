/**
 * Node file system benchmark.
 * Run with: pnpm --filter @ecopages/file-system run benchmark
 */

import { bench, group, run } from 'mitata';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NodeFileSystem } from '../src/adapters/node.ts';

const benchDir = path.join(import.meta.dirname, '.bench-fixtures');
const largeFile = path.join(benchDir, 'large.txt');
const smallFile = path.join(benchDir, 'small.txt');

mkdirSync(benchDir, { recursive: true });
for (let i = 0; i < 100; i++) {
	writeFileSync(path.join(benchDir, `file${i}.ts`), `export const x${i} = ${i};`);
}
writeFileSync(smallFile, 'Hello World');
writeFileSync(largeFile, 'x'.repeat(1024 * 1024));

const nodeFs = new NodeFileSystem();

console.log('\n@ecopages/file-system benchmark\n');

group('glob(**/*.ts) - 100 files', () => {
	bench('NodeFileSystem', async () => {
		await nodeFs.glob(['**/*.ts'], { cwd: benchDir });
	});
});

group('readFile (small)', () => {
	bench('NodeFileSystem', async () => {
		await nodeFs.readFile(smallFile);
	});
});

group('hash (1MB)', () => {
	bench('NodeFileSystem', () => {
		nodeFs.hash(largeFile);
	});
});

await run();
rmSync(benchDir, { recursive: true, force: true });
