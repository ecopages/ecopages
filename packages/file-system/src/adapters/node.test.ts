import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
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
		let revision = 0;
		const reported = (type: string, file: string) => changes.includes(`${type} ${path.join('src', file)}`);
		const retryUntil = (change: () => void, done: () => boolean) =>
			vi.waitFor(
				() => {
					change();
					assert.ok(done());
				},
				{ timeout: 10_000, interval: 150 },
			);

		await retryUntil(
			() => {
				fs.writeFileSync(
					path.join(rootDir, 'node_modules', 'dep', 'index.js'),
					`module.exports = ${revision}`,
					'utf8',
				);
				fs.writeFileSync(
					path.join(rootDir, 'src', 'existing.ts'),
					`export const existing = ${(revision += 1)};`,
					'utf8',
				);
			},
			() => reported('change', 'existing.ts'),
		);
		await retryUntil(
			() => fs.writeFileSync(path.join(rootDir, 'src', `created-${(revision += 1)}.ts`), 'export {};', 'utf8'),
			() => changes.some((change) => change.startsWith(`add ${path.join('src', 'created-')}`)),
		);

		assert.ok(!changes.some((change) => change.includes('node_modules')));
		assert.ok(ignoredPaths.includes(path.join(rootDir, 'node_modules')));
		assert.ok(
			!ignoredPaths.some((ignoredPath) => ignoredPath.startsWith(path.join(rootDir, 'node_modules', 'dep'))),
		);
	} finally {
		await watcher.close();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);
