import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';

type NativeWatcher = {
	path: string;
	recursive: boolean;
	notify: (eventType: string, filename: string | null) => void;
};

const nativeWatchers = vi.hoisted(() => ({
	watchers: [] as NativeWatcher[],
	notifications: [] as Array<{ eventType: string; filename: string | null }>,
}));
const nativePromises = vi.hoisted(() => ({
	delayedStatPath: undefined as string | undefined,
	statStarted: undefined as (() => void) | undefined,
	releaseStat: undefined as (() => void) | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		watch: (watchPath: string, options: { recursive?: boolean }, listener: NativeWatcher['notify']) => {
			nativeWatchers.watchers.push({
				path: watchPath,
				recursive: options.recursive ?? false,
				notify: listener,
			});
			const notification = nativeWatchers.notifications.shift();
			if (notification) listener(notification.eventType, notification.filename);
			return Object.assign(new EventEmitter(), { close: vi.fn() });
		},
	};
});

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return {
		...actual,
		stat: async (...args: Parameters<typeof actual.stat>) => {
			const stats = await actual.stat(...args);
			if (String(args[0]) === nativePromises.delayedStatPath) {
				nativePromises.statStarted?.();
				await new Promise<void>((resolve) => {
					nativePromises.releaseStat = resolve;
				});
			}
			return stats;
		},
	};
});

import { NodeFileSystem } from './node.ts';

test('reconciles a watched root when native events omit the filename', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-null-name-')));
	const requestedRoot = path.join(path.dirname(rootDir), `${path.basename(rootDir)}-link`);
	const changedFile = path.join(rootDir, 'entry.ts');
	const ignoredDirectory = path.join(rootDir, '.cache');
	const ignoredFile = path.join(ignoredDirectory, 'entry.ts');
	const symlinkDirectory = path.join(rootDir, 'cycle');
	symlinkSync(rootDir, requestedRoot, 'dir');
	writeFileSync(changedFile, 'export const value = 1;', 'utf8');
	mkdirSync(ignoredDirectory);
	writeFileSync(ignoredFile, 'export const ignored = true;', 'utf8');
	symlinkSync(rootDir, symlinkDirectory, process.platform === 'win32' ? 'junction' : 'dir');
	nativeWatchers.watchers.length = 0;
	const changes: Array<{ type: string; path: string }> = [];
	const ignoredPaths: string[] = [];
	const fileSystem = new NodeFileSystem();
	const watcher = fileSystem.watch([requestedRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
		ignored: (watchedPath) => {
			ignoredPaths.push(watchedPath);
			return watchedPath === path.join(requestedRoot, '.cache');
		},
	});

	try {
		await watcher.ready;
		const ignoredPathCallsBeforeReconciliation = ignoredPaths.length;
		writeFileSync(changedFile, 'export const value = 2;', 'utf8');
		const recursiveWatcher = nativeWatchers.watchers.find(({ recursive }) => recursive);
		expect(recursiveWatcher).toBeDefined();
		recursiveWatcher?.notify('change', null);
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'rescan', path: requestedRoot }));
		expect(changes.filter(({ type }) => type === 'rescan')).toHaveLength(1);
		expect(ignoredPaths.slice(ignoredPathCallsBeforeReconciliation)).toContain(path.join(requestedRoot, '.cache'));
		expect(ignoredPaths.slice(ignoredPathCallsBeforeReconciliation)).not.toContain(
			path.join(requestedRoot, '.cache', 'entry.ts'),
		);
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('reports native change events when file metadata is unchanged', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-change-event-')));
	const changedFile = path.join(rootDir, 'entry.ts');
	writeFileSync(changedFile, 'export const value = 1;', 'utf8');
	nativeWatchers.watchers.length = 0;
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		const recursiveWatcher = nativeWatchers.watchers.find(({ recursive }) => recursive);
		expect(recursiveWatcher).toBeDefined();
		recursiveWatcher?.notify('change', 'entry.ts');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: changedFile }));
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('maps a filename-less parent watcher event to a requested directory root', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-parent-rescan-')));
	const realRoot = path.join(rootDir, 'real');
	const requestedRoot = path.join(rootDir, 'linked');
	mkdirSync(realRoot);
	symlinkSync(realRoot, requestedRoot, 'dir');
	nativeWatchers.watchers.length = 0;
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([requestedRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		const parentWatcher = nativeWatchers.watchers.find(
			({ path: watchPath, recursive }) => !recursive && watchPath === rootDir,
		);
		expect(parentWatcher).toBeDefined();
		parentWatcher?.notify('rename', null);
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'rescan', path: requestedRoot }));
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('does not report an initial rescan for an event received while indexing a new root', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-index-rescan-')));
	writeFileSync(path.join(rootDir, 'entry.ts'), 'export const value = 1;', 'utf8');
	nativeWatchers.watchers.length = 0;
	nativeWatchers.notifications.push({ eventType: 'rename', filename: null });
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		await new Promise((resolve) => setTimeout(resolve, 75));
		expect(changes).toEqual([]);
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('catches a file edit during native watcher registration before add resolves', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-add-race-')));
	const initialRoot = path.join(rootDir, 'initial');
	const addedRoot = path.join(rootDir, 'added');
	const initialFile = path.join(initialRoot, 'initial.ts');
	const addedFile = path.join(addedRoot, 'entry.ts');
	mkdirSync(initialRoot);
	mkdirSync(addedRoot);
	writeFileSync(initialFile, 'export const initial = 1;', 'utf8');
	writeFileSync(addedFile, 'export const value = 1;', 'utf8');
	nativeWatchers.watchers.length = 0;
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([initialRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});
	let resolveStatStarted!: () => void;
	const statStarted = new Promise<void>((resolve) => {
		resolveStatStarted = resolve;
	});
	nativePromises.delayedStatPath = addedFile;
	nativePromises.statStarted = resolveStatStarted;

	try {
		await watcher.ready;
		const addPromise = watcher.add([addedFile]);
		await statStarted;
		const addedRootWatcher = nativeWatchers.watchers.find(
			({ path: watchPath, recursive }) => !recursive && watchPath === addedRoot,
		);
		expect(addedRootWatcher).toBeDefined();
		addedRootWatcher?.notify('change', null);
		expect(changes).toEqual([]);
		writeFileSync(addedFile, 'export const value = 2;', 'utf8');
		await new Promise((resolve) => setTimeout(resolve, 75));
		expect(changes).toEqual([]);
		const releaseStat = nativePromises.releaseStat;
		if (!releaseStat) throw new Error('The delayed stat did not provide a release callback');
		releaseStat();
		await addPromise;
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: addedFile }));
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'rescan', path: addedRoot }));
	} finally {
		nativePromises.delayedStatPath = undefined;
		nativePromises.statStarted = undefined;
		nativePromises.releaseStat = undefined;
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);
