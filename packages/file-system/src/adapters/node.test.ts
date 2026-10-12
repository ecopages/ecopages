import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { NodeFileSystem } from './node.ts';

test('NodeFileSystem.glob uses native Node glob semantics with ignore support', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-glob-'));
	const fileSystem = new NodeFileSystem();

	fs.mkdirSync(path.join(rootDir, 'nested'), { recursive: true });
	fs.writeFileSync(path.join(rootDir, 'entry.ts'), 'export const entry = true;', 'utf8');
	fs.writeFileSync(path.join(rootDir, 'nested', 'child.ts'), 'export const child = true;', 'utf8');
	fs.writeFileSync(path.join(rootDir, 'nested', 'ignored.ts'), 'export const ignored = true;', 'utf8');

	try {
		const matches = await fileSystem.glob(['**/*.ts', 'nested/*.ts'], {
			cwd: rootDir,
			ignore: ['**/ignored.ts'],
		});

		assert.deepEqual(matches.sort(), ['entry.ts', 'nested/child.ts']);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

test('NodeFileSystem.watch reports changes after ready and never descends into an ignored directory', async () => {
	const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-')));
	const fileSystem = new NodeFileSystem();
	fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	fs.mkdirSync(path.join(rootDir, 'node_modules', 'dep'), { recursive: true });
	fs.writeFileSync(path.join(rootDir, 'src', 'existing.ts'), 'export const existing = 1;', 'utf8');
	const changes: string[] = [];
	const ignoredPaths: string[] = [];
	const watcher = fileSystem.watch([rootDir], {
		onChange: (change) => changes.push(`${change.type} ${path.relative(rootDir, change.path)}`),
		onError: (error) => {
			throw error;
		},
		ignored: (watchedPath) => {
			const ignored = watchedPath.split(path.sep).includes('node_modules');
			if (ignored) ignoredPaths.push(watchedPath);
			return ignored;
		},
	});

	try {
		await watcher.ready;
		fs.writeFileSync(path.join(rootDir, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;', 'utf8');
		fs.writeFileSync(path.join(rootDir, 'src', 'existing.ts'), 'export const existing = 2;', 'utf8');
		fs.writeFileSync(path.join(rootDir, 'src', 'created.ts'), 'export const created = 1;', 'utf8');
		await waitFor(() => changes.length >= 2);

		assert.deepEqual(changes.sort(), [
			`add ${path.join('src', 'created.ts')}`,
			`change ${path.join('src', 'existing.ts')}`,
		]);
		assert.ok(ignoredPaths.includes(path.join(rootDir, 'node_modules')));
		assert.ok(
			!ignoredPaths.some((ignoredPath) => ignoredPath.startsWith(path.join(rootDir, 'node_modules', 'dep'))),
		);
	} finally {
		await watcher.close();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for file changes');
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
