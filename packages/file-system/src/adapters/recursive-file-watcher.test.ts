import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';

type NativeWatcher = {
	path: string;
	recursive: boolean;
	ignore?: (relativePath: string) => boolean;
	closed: boolean;
	notify: (eventType: string, filename: string | null) => void;
};

const nativeWatchers = vi.hoisted(() => ({
	watchers: [] as NativeWatcher[],
	notifications: [] as Array<{ eventType: string; filename: string | null }>,
	failNextWatchPath: undefined as string | undefined,
}));
const nativePromises = vi.hoisted(() => ({
	delayedStatPath: undefined as string | undefined,
	statStarted: undefined as (() => void) | undefined,
	releaseStat: undefined as (() => void) | undefined,
	permissionDeniedLstatPath: undefined as string | undefined,
	failReaddirPath: undefined as string | undefined,
	failReaddirOnOccurrence: undefined as number | undefined,
	failReaddirCode: 'EIO',
	readdirCallsOnFailurePath: 0,
}));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		watch: (
			watchPath: string,
			options: { recursive?: boolean; ignore?: (relativePath: string) => boolean },
			listener: NativeWatcher['notify'],
		) => {
			if (nativeWatchers.failNextWatchPath === watchPath) {
				nativeWatchers.failNextWatchPath = undefined;
				throw new Error('Temporary native watch failure');
			}
			const watcher: NativeWatcher = {
				path: watchPath,
				recursive: options.recursive ?? false,
				ignore: options.ignore,
				closed: false,
				notify: (eventType, filename) => {
					if (!watcher.closed) listener(eventType, filename);
				},
			};
			nativeWatchers.watchers.push(watcher);
			const notification = nativeWatchers.notifications.shift();
			if (notification) watcher.notify(notification.eventType, notification.filename);
			return Object.assign(new EventEmitter(), {
				close: vi.fn(() => {
					watcher.closed = true;
				}),
			});
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
		lstat: async (...args: Parameters<typeof actual.lstat>) => {
			if (String(args[0]) === nativePromises.permissionDeniedLstatPath) {
				const error = new Error('Permission denied') as NodeJS.ErrnoException;
				error.code = 'EACCES';
				throw error;
			}
			return actual.lstat(...args);
		},
		readdir: async (...args: Parameters<typeof actual.readdir>) => {
			if (String(args[0]) === nativePromises.failReaddirPath) {
				nativePromises.readdirCallsOnFailurePath += 1;
				if (nativePromises.readdirCallsOnFailurePath === nativePromises.failReaddirOnOccurrence) {
					const error = new Error('Temporary directory read failure') as NodeJS.ErrnoException;
					error.code = nativePromises.failReaddirCode;
					nativePromises.failReaddirPath = undefined;
					throw error;
				}
			}
			return actual.readdir(...args);
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

test('retries adding a path after native watcher registration fails', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-add-retry-')));
	const initialRoot = path.join(rootDir, 'initial');
	const addedRoot = path.join(rootDir, 'added');
	const addedFile = path.join(addedRoot, 'entry.ts');
	mkdirSync(initialRoot);
	mkdirSync(addedRoot);
	writeFileSync(addedFile, 'export const value = 1;', 'utf8');
	nativeWatchers.watchers.length = 0;
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([initialRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		nativeWatchers.failNextWatchPath = addedRoot;
		await expect(watcher.add([addedRoot])).rejects.toThrow('Temporary native watch failure');
		expect(nativeWatchers.watchers.some(({ path: watchPath }) => watchPath === addedRoot)).toBe(false);

		await watcher.add([addedRoot]);
		const addedRootWatcher = nativeWatchers.watchers.find(({ path: watchPath }) => watchPath === addedRoot);
		expect(addedRootWatcher).toBeDefined();
		writeFileSync(addedFile, 'export const value = 2;', 'utf8');
		addedRootWatcher?.notify('change', 'entry.ts');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: addedFile }));
	} finally {
		nativeWatchers.failNextWatchPath = undefined;
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('keeps existing native watchers when adding a wider root fails during catch-up', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-add-rollback-')));
	const existingRoot = path.join(rootDir, 'existing');
	const existingFile = path.join(existingRoot, 'entry.ts');
	mkdirSync(existingRoot);
	writeFileSync(existingFile, 'export const value = 1;', 'utf8');
	nativeWatchers.watchers.length = 0;
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([existingRoot], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		const existingNativeWatcher = nativeWatchers.watchers.find(
			({ path: watchPath, recursive }) => watchPath === existingRoot && recursive,
		);
		expect(existingNativeWatcher).toBeDefined();
		nativePromises.failReaddirPath = existingRoot;
		nativePromises.failReaddirOnOccurrence = 2;
		nativePromises.readdirCallsOnFailurePath = 0;
		await expect(watcher.add([rootDir])).rejects.toThrow('Temporary directory read failure');
		expect(existingNativeWatcher?.closed).toBe(false);
		expect(
			nativeWatchers.watchers.some(
				(nativeWatcher) => nativeWatcher.path === rootDir && nativeWatcher.recursive && !nativeWatcher.closed,
			),
		).toBe(false);

		writeFileSync(existingFile, 'export const value = 2;', 'utf8');
		existingNativeWatcher?.notify('change', 'entry.ts');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: existingFile }));
	} finally {
		nativePromises.failReaddirPath = undefined;
		nativePromises.failReaddirOnOccurrence = undefined;
		nativePromises.readdirCallsOnFailurePath = 0;
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('skips permission-denied children while indexing the rest of a watched root', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-permission-')));
	const deniedFile = path.join(rootDir, 'a-denied.ts');
	const visibleFile = path.join(rootDir, 'z-visible.ts');
	writeFileSync(deniedFile, 'export const denied = true;', 'utf8');
	writeFileSync(visibleFile, 'export const value = 1;', 'utf8');
	nativeWatchers.watchers.length = 0;
	nativePromises.permissionDeniedLstatPath = deniedFile;
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		nativePromises.permissionDeniedLstatPath = undefined;
		const recursiveWatcher = nativeWatchers.watchers.find(({ recursive }) => recursive);
		expect(recursiveWatcher).toBeDefined();
		writeFileSync(visibleFile, 'export const value = 2;', 'utf8');
		recursiveWatcher?.notify('change', 'z-visible.ts');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: visibleFile }));
	} finally {
		nativePromises.permissionDeniedLstatPath = undefined;
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

test('lets native recursive watchers skip subtrees the caller always ignores', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-native-ignore-')));
	mkdirSync(path.join(rootDir, 'node_modules'));
	mkdirSync(path.join(rootDir, 'data'));
	nativeWatchers.watchers.length = 0;
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: () => {},
		onError: (error) => {
			throw error;
		},
		ignored: (watchedPath, stats) =>
			path.basename(watchedPath) === 'node_modules' || (stats !== undefined && watchedPath.endsWith('data')),
	});

	try {
		await watcher.ready;
		const recursiveWatcher = nativeWatchers.watchers.find(({ recursive }) => recursive);
		expect(recursiveWatcher?.ignore?.('node_modules')).toBe(true);
		expect(recursiveWatcher?.ignore?.('data')).toBe(false);
		expect(recursiveWatcher?.ignore?.(path.join('src', 'entry.ts'))).toBe(false);
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('reports a directory the ignore predicate allows after a later add', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-widened-')));
	const dataFile = path.join(rootDir, 'data', 'x.json');
	mkdirSync(path.join(rootDir, 'data'));
	writeFileSync(dataFile, '1');
	nativeWatchers.watchers.length = 0;
	const allowed = new Set<string>();
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: (change) => changes.push(change),
		onError: (error) => {
			throw error;
		},
		ignored: (watchedPath, stats) =>
			stats !== undefined &&
			watchedPath !== rootDir &&
			![...allowed].some(
				(allowedPath) => allowedPath === watchedPath || allowedPath.startsWith(`${watchedPath}${path.sep}`),
			),
	});

	try {
		await watcher.ready;
		const recursiveWatcher = nativeWatchers.watchers.find(({ recursive }) => recursive);
		writeFileSync(dataFile, '2');
		recursiveWatcher?.notify('change', path.join('data', 'x.json'));
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(changes).toEqual([]);

		allowed.add(dataFile);
		await watcher.add([dataFile]);
		writeFileSync(dataFile, '3');
		recursiveWatcher?.notify('change', path.join('data', 'x.json'));
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'change', path: dataFile }));
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('treats a new directory removed while it is indexed as gone, not as a watcher error', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-vanished-dir-')));
	const addedDirectory = path.join(rootDir, 'added');
	nativeWatchers.watchers.length = 0;
	const errors: unknown[] = [];
	const changes: Array<{ type: string; path: string }> = [];
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: (change) => changes.push(change),
		onError: (error) => errors.push(error),
	});

	try {
		await watcher.ready;
		mkdirSync(addedDirectory);
		nativePromises.failReaddirPath = addedDirectory;
		nativePromises.failReaddirOnOccurrence = 1;
		nativePromises.readdirCallsOnFailurePath = 0;
		nativePromises.failReaddirCode = 'ENOENT';
		nativeWatchers.watchers.find(({ recursive }) => recursive)?.notify('rename', 'added');
		await vi.waitFor(() => expect(changes).toContainEqual({ type: 'addDir', path: addedDirectory }));
		await vi.waitFor(() => expect(nativePromises.readdirCallsOnFailurePath).toBe(1));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(errors).toEqual([]);
	} finally {
		nativePromises.failReaddirPath = undefined;
		nativePromises.failReaddirCode = 'EIO';
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);

test('opens no native watcher for a directory found after close', async () => {
	const rootDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-node-fs-watch-close-during-index-')));
	nativeWatchers.watchers.length = 0;
	let closing: Promise<void> | undefined;
	const watcher = new NodeFileSystem().watch([rootDir], {
		onChange: (change) => {
			if (change.type === 'addDir' && change.path.endsWith(`${path.sep}b`)) closing = watcher.close();
		},
		onError: (error) => {
			throw error;
		},
	});

	try {
		await watcher.ready;
		mkdirSync(path.join(rootDir, 'a', 'b', 'c'), { recursive: true });
		nativeWatchers.watchers.find(({ recursive }) => recursive)?.notify('rename', 'a');
		await vi.waitFor(() => expect(closing).toBeDefined());
		await closing;
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(nativeWatchers.watchers.filter(({ closed }) => !closed)).toEqual([]);
	} finally {
		await watcher.close();
		rmSync(rootDir, { recursive: true, force: true });
	}
}, 20_000);
