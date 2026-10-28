import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
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

test('NodeFileSystem.watch reports nested changes without initial events', async () => {
	const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-')));
	const fileSystem = new NodeFileSystem();
	const sourceDir = path.join(rootDir, 'src');
	const nestedDir = path.join(sourceDir, 'nested');
	const ignoredDir = path.join(rootDir, 'node_modules', 'dep');
	fs.mkdirSync(sourceDir, { recursive: true });
	fs.mkdirSync(ignoredDir, { recursive: true });
	const existingFile = path.join(sourceDir, 'existing.ts');
	fs.writeFileSync(existingFile, 'export const existing = 1;', 'utf8');
	const changes: Array<{ type: string; path: string }> = [];
	const ignoredPaths: string[] = [];
	const watcher = fileSystem.watch([rootDir], {
		onChange: (change) => changes.push(change),
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
		expect(changes).toEqual([]);
		fs.writeFileSync(existingFile, 'export const existing = 2;', 'utf8');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: existingFile }));
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(changes).toEqual([{ type: 'change', path: existingFile }]);

		changes.length = 0;
		fs.mkdirSync(nestedDir);
		const createdFile = path.join(nestedDir, 'created.ts');
		fs.writeFileSync(createdFile, 'export const created = 1;', 'utf8');
		await vi.waitFor(() =>
			expect(changes).toEqual(
				expect.arrayContaining([
					{ type: 'addDir', path: nestedDir },
					{ type: 'add', path: createdFile },
				]),
			),
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(changes).toEqual([
			{ type: 'addDir', path: nestedDir },
			{ type: 'add', path: createdFile },
		]);

		changes.length = 0;
		const replacement = path.join(sourceDir, 'existing.tmp.ts');
		fs.writeFileSync(replacement, 'export const existing = 3;', 'utf8');
		fs.renameSync(replacement, existingFile);
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: existingFile }));
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(changes).toEqual([{ type: 'change', path: existingFile }]);

		changes.length = 0;
		fs.rmSync(existingFile);
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'unlink', path: existingFile }));

		changes.length = 0;
		fs.rmSync(nestedDir, { recursive: true });
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'unlinkDir', path: nestedDir }));
		changes.length = 0;
		fs.writeFileSync(path.join(ignoredDir, 'index.js'), 'module.exports = true;', 'utf8');
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(changes).toEqual([]);
		assert.ok(ignoredPaths.includes(path.join(rootDir, 'node_modules')));
		assert.ok(
			!ignoredPaths.some((ignoredPath) => ignoredPath.startsWith(path.join(rootDir, 'node_modules', 'dep'))),
		);
	} finally {
		await watcher.close();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('NodeFileSystem.watch maps real paths back to a symlinked root and follows a root created later', async () => {
	const realRoot = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-real-')));
	const requestedRoot = path.join(tmpdir(), `eco-node-fs-watch-link-${Date.now()}`);
	const futureParent = path.join(path.dirname(realRoot), `eco-node-fs-watch-future-${Date.now()}`);
	const futureRoot = path.join(futureParent, 'created-later');
	const fileSystem = new NodeFileSystem();
	fs.symlinkSync(realRoot, requestedRoot, 'dir');
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = fileSystem.watch([requestedRoot, futureRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		const newDirectory = path.join(realRoot, 'nested');
		fs.mkdirSync(newDirectory);
		await vi.waitFor(() =>
			expect(changes).toContainEqual({ type: 'addDir', path: path.join(requestedRoot, 'nested') }),
		);
		const newFile = path.join(newDirectory, 'linked.ts');
		fs.writeFileSync(newFile, 'export {};', 'utf8');
		await vi.waitFor(() =>
			expect(changes).toContainEqual({ type: 'add', path: path.join(requestedRoot, 'nested', 'linked.ts') }),
		);
		changes.length = 0;
		fs.mkdirSync(futureRoot, { recursive: true });
		const futureFile = path.join(futureRoot, 'future.ts');
		fs.writeFileSync(futureFile, 'export {};', 'utf8');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'add', path: futureFile }));
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(changes).toEqual([
			{ type: 'addDir', path: futureRoot },
			{ type: 'add', path: futureFile },
		]);
	} finally {
		await watcher.close();
		fs.rmSync(requestedRoot, { force: true });
		fs.rmSync(futureParent, { recursive: true, force: true });
		fs.rmSync(realRoot, { recursive: true, force: true });
	}
}, 20_000);

test('NodeFileSystem.watch observes an existing file path', async () => {
	const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-file-')));
	const watchedFile = path.join(rootDir, 'watched.ts');
	const fileSystem = new NodeFileSystem();
	const changes: Array<{ type: string; path: string }> = [];
	fs.writeFileSync(watchedFile, 'export const value = 1;', 'utf8');
	const watcher = fileSystem.watch([watchedFile], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		fs.writeFileSync(watchedFile, 'export const value = 2;', 'utf8');
		await vi.waitFor(() =>
			expect(
				changes.some(
					(change) =>
						(change.type === 'change' && change.path === watchedFile) ||
						(change.type === 'rescan' && change.path === rootDir),
				),
			).toBe(true),
		);
		expect(changes.filter(({ type, path: changePath }) => type === 'change' && changePath !== watchedFile)).toEqual(
			[],
		);
		expect(changes.filter(({ type, path: changePath }) => type === 'rescan' && changePath !== rootDir)).toEqual([]);
		expect(changes.length).toBeGreaterThan(0);
	} finally {
		await watcher.close();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('NodeFileSystem.watch adds existing paths to one running subscription', async () => {
	const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-add-')));
	const initialRoot = path.join(rootDir, 'initial');
	const addedRoot = path.join(rootDir, 'added');
	const firstAddedFile = path.join(addedRoot, 'first.ts');
	const secondAddedFile = path.join(addedRoot, 'second.ts');
	const fileSystem = new NodeFileSystem();
	fs.mkdirSync(initialRoot);
	fs.mkdirSync(addedRoot);
	fs.writeFileSync(firstAddedFile, 'export const first = 1;', 'utf8');
	fs.writeFileSync(secondAddedFile, 'export const second = 1;', 'utf8');
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = fileSystem.watch([initialRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		await watcher.add([firstAddedFile, secondAddedFile]);
		expect(changes).toEqual([]);
		fs.writeFileSync(secondAddedFile, 'export const second = 2;', 'utf8');
		await vi.waitFor(() =>
			expect(
				changes.some(
					(change) =>
						(change.type === 'change' && change.path === secondAddedFile) ||
						(change.type === 'rescan' && change.path === addedRoot),
				),
			).toBe(true),
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(
			changes.filter(({ type, path: changePath }) => type === 'change' && changePath !== secondAddedFile),
		).toEqual([]);
		expect(changes.filter(({ type, path: changePath }) => type === 'rescan' && changePath !== addedRoot)).toEqual(
			[],
		);
		expect(changes.length).toBeGreaterThan(0);
	} finally {
		await watcher.close();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('NodeFileSystem.watch skips indexing an ignored root directory', async () => {
	const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-ignore-root-')));
	const nestedFile = path.join(rootDir, 'nested', 'entry.ts');
	const fileSystem = new NodeFileSystem();
	fs.mkdirSync(path.dirname(nestedFile), { recursive: true });
	fs.writeFileSync(nestedFile, 'export {};', 'utf8');
	const ignoredPaths: string[] = [];
	const watcher = fileSystem.watch([rootDir], {
		onChange: () => {},
		onError: (error) => {
			throw error;
		},
		ignored: (watchedPath) => {
			ignoredPaths.push(watchedPath);
			return watchedPath === rootDir;
		},
	});

	try {
		await watcher.ready;
		expect(ignoredPaths).toContain(rootDir);
		expect(ignoredPaths).not.toContain(path.join(rootDir, 'nested'));
		expect(ignoredPaths).not.toContain(nestedFile);
	} finally {
		await watcher.close();
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);
