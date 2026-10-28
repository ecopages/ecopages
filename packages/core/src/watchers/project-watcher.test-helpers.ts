import path from 'node:path';
import { fileSystem, type FileChange, type FileWatcher, type WatchOptions } from '@ecopages/file-system';
import { onTestFinished, vi, type Mock } from 'vitest';
import { ProjectWatcher, type ProjectWatcherConfig } from './project-watcher.ts';
import type { IHmrManager } from '../config/internal-types.ts';
import type { ResolvedHmrEntrypoint } from '../types/contracts.ts';
import type { IClientBridge } from '../config/internal-types.ts';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChanges: vi.fn(async () => {}),
		broadcast: vi.fn(() => {}),
		setEnabled: vi.fn(() => {}),
		registerEntrypoint: vi.fn(async () => ''),
		registerDevTransformContributor: vi.fn(() => {}),
		registerScriptEntrypoint: vi.fn(async () => ({
			sourcePath: '',
			outputPath: '',
			outputUrl: '',
			role: 'script',
		})),
		registerStrategy: vi.fn(() => {}),
		isEnabled: vi.fn(() => true),
		getWatchedFiles: vi.fn(() => new Map()),
		getRegisteredEntrypoints: vi.fn(() => new Map()),
		tryHandleAssetRequest: vi.fn(() => null),
		injectDevClientRuntimes: vi.fn(async (response: Response) => response),
		getDefaultContext: vi.fn(() => ({
			getWatchedFiles: () => new Map(),
			getRegisteredEntrypoints: () => new Map(),
			getSrcDir: () => '',
			getLayoutsDir: () => '',
			getPagesDir: () => '',
			importServerModule: vi.fn(async () => ({})),
		})),
	}) as unknown as IHmrManager;

export function registerMockEntrypoint(
	hmrManager: IHmrManager,
	filePath: string,
	role: ResolvedHmrEntrypoint['role'] = 'page',
): void {
	const sourcePath = path.resolve(filePath);
	vi.mocked(hmrManager.getRegisteredEntrypoints).mockReturnValue(
		new Map([
			[
				sourcePath,
				{
					sourcePath,
					outputPath: sourcePath,
					outputUrl: `/@eco/dev/${path.basename(sourcePath)}`,
					role,
				},
			],
		]),
	);
}

export const createMockBridge = (): IClientBridge =>
	({
		reload: vi.fn(() => {}),
		error: vi.fn(() => {}),
		cssUpdate: vi.fn(() => {}),
		update: vi.fn(() => {}),
		subscribe: vi.fn(() => {}),
		unsubscribe: vi.fn(() => {}),
		broadcast: vi.fn(() => {}),
		subscriberCount: 0,
	}) as unknown as IClientBridge;

export interface FakeFileSystemWatchHandle extends FileWatcher {
	paths: readonly string[];
	options: WatchOptions;
	add: Mock<FileWatcher['add']>;
	close: Mock<() => Promise<void>>;
}

export interface FakeFileSystemWatchOptions {
	/** `immediate` resolves readiness after registration; `manual` leaves it to the test. */
	ready?: 'immediate' | 'manual';
}

export interface FakeFileSystemWatch {
	/** The spy whose calls contain watched paths and options. */
	watch: Mock<typeof fileSystem.watch>;
	handles: FakeFileSystemWatchHandle[];
	handle: FakeFileSystemWatchHandle;
	/** Delivers a change or readiness failure through the registered filesystem callbacks. */
	emit(event: string, ...args: unknown[]): Promise<void>;
}

/** Replaces the filesystem watch API with handles the test drives through `emit`. */
export function installFakeFileSystemWatch({
	ready = 'immediate',
}: FakeFileSystemWatchOptions = {}): FakeFileSystemWatch {
	const handles: FakeFileSystemWatchHandle[] = [];
	const watch = vi.spyOn(fileSystem, 'watch').mockImplementation((paths, options) => {
		let resolveReady!: () => void;
		let rejectReady!: (error: unknown) => void;
		const watcherReady = new Promise<void>((resolve, reject) => {
			resolveReady = resolve;
			rejectReady = reject;
		});
		const handle: FakeFileSystemWatchHandle = {
			paths: [...paths],
			options,
			ready: watcherReady,
			add: vi.fn(async (additionalPaths) => {
				handle.paths = [...handle.paths, ...additionalPaths];
			}),
			close: vi.fn(async () => {}),
		};
		readinessByHandle.set(handle, { resolve: resolveReady, reject: rejectReady });
		handles.push(handle);
		if (ready === 'immediate') queueMicrotask(resolveReady);
		return handle;
	});
	const emit = async (event: string, ...args: unknown[]): Promise<void> => {
		if (event === 'ready') {
			for (const handle of handles) {
				resolveHandleReady(handle);
			}
			return;
		}
		if (event === 'error') {
			const error = args[0];
			for (const handle of handles) {
				handle.options.onError(error);
				rejectHandleReady(handle, error);
			}
			return;
		}
		const change: FileChange = { type: event as FileChange['type'], path: String(args[0]) };
		const eventPath = path.resolve(change.path);
		await Promise.all(
			handles
				.filter((handle) => handle.paths.some((watchPath) => isSameOrInside(eventPath, watchPath)))
				.map((handle) => handle.options.onChange(change)),
		);
	};
	return {
		watch,
		handles,
		get handle() {
			const firstHandle = handles[0];
			if (!firstHandle) throw new Error('Filesystem watch was not started');
			return firstHandle;
		},
		emit,
	};
}

export interface FakeFileSystemWatchSubscription extends FakeFileSystemWatch {
	watcher: ProjectWatcher;
}

/** Starts a ProjectWatcher with a fake filesystem watch and closes it after the test. */
export async function subscribeWithFakeFileSystemWatch(
	config: ProjectWatcherConfig,
	options?: FakeFileSystemWatchOptions,
): Promise<FakeFileSystemWatchSubscription> {
	const fake = installFakeFileSystemWatch(options);
	const watcher = new ProjectWatcher(config);
	onTestFinished(() => watcher.close());
	await watcher.createWatcherSubscription();
	return { ...fake, watcher };
}

const readinessByHandle = new WeakMap<
	FakeFileSystemWatchHandle,
	{ resolve: () => void; reject: (error: unknown) => void }
>();

function resolveHandleReady(handle: FakeFileSystemWatchHandle): void {
	readinessByHandle.get(handle)?.resolve();
}

function rejectHandleReady(handle: FakeFileSystemWatchHandle, error: unknown): void {
	readinessByHandle.get(handle)?.reject(error);
}

function isSameOrInside(candidate: string, root: string): boolean {
	const relativePath = path.relative(path.resolve(root), path.resolve(candidate));
	return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`));
}
