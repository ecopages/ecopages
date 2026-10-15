import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { onTestFinished, vi, type Mock } from 'vitest';
import { ProjectWatcher, type ProjectWatcherConfig } from './project-watcher.ts';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';
import type { ResolvedHmrEntrypoint } from '../types/public-types.ts';
import {
	InMemoryEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
} from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { getAppModuleLoader } from '../services/module-loading/app-server-module-transpiler.service.ts';
import { requireAppRuntime } from '../config/app-runtime.ts';
import type { IClientBridge } from '../types/internal-types.ts';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChange: vi.fn(async () => {}),
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
			getEntrypointDependencyGraph: () => ({
				supportsSelectiveInvalidation: () => false,
				getDependencyEntrypoints: () => new Set(),
				setEntrypointDependencies: () => {},
				clearEntrypointDependencies: () => {},
				reset: () => {},
			}),
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

/**
 * Installs the in-memory entrypoint dependency graph that the HMR managers
 * provide in dev, and the app module loader that owns the development generation.
 *
 * @remarks
 * `finalizeEcoPagesConfig()` already installs a no-op graph; this swaps in a graph
 * that records dependencies.
 */
export function installDevRuntimeState(appConfig: EcoPagesAppConfig): void {
	getAppModuleLoader(appConfig);
	setAppEntrypointDependencyGraph(
		appConfig,
		new InMemoryEntrypointDependencyGraph(requireAppRuntime(appConfig).buildInputIndex),
	);
}

type FakeChokidarListener = (...args: unknown[]) => unknown;

/**
 * The stand-in for the `FSWatcher` that `chokidar.watch` returns.
 */
export interface FakeChokidarHandle {
	add: Mock<(paths: string | string[]) => void>;
	close: Mock<() => Promise<void>>;
	getWatched: Mock<() => Record<string, string[]>>;
	on: Mock<(event: string, listener: FakeChokidarListener) => FakeChokidarHandle>;
	once: Mock<(event: string, listener: FakeChokidarListener) => FakeChokidarHandle>;
}

export interface FakeChokidarOptions {
	/**
	 * `immediate` emits `ready` as soon as the watcher registers for it; `manual` leaves it to the test.
	 */
	ready?: 'immediate' | 'manual';
}

export interface FakeChokidar {
	/** The spy that replaces `chokidar.watch`; its calls hold the watched paths and options. */
	watch: Mock<typeof chokidar.watch>;
	handle: FakeChokidarHandle;
	/**
	 * Delivers a Chokidar event to every registered listener and resolves when each has settled.
	 *
	 * @remarks
	 * The listeners are the production handlers, so a `change`, `add` or `unlink` event goes through the same
	 * path as a real filesystem event: debounce, batching and the invalidation plan. With a nonzero
	 * `changeDebounceMs` the promise settles after the batch flushes, so call it as `void emit(...)` and
	 * advance fake timers.
	 */
	emit(event: string, ...args: unknown[]): Promise<void>;
}

/**
 * Replaces `chokidar.watch` with an in-memory watcher the test drives through `emit`.
 *
 * @remarks
 * Vitest restores the spy after each test.
 */
export function installFakeChokidar({ ready = 'immediate' }: FakeChokidarOptions = {}): FakeChokidar {
	const listeners = new Map<string, FakeChokidarListener[]>();
	const addListener = (event: string, listener: FakeChokidarListener) => {
		listeners.set(event, [...(listeners.get(event) ?? []), listener]);
	};
	const emit = async (event: string, ...args: unknown[]): Promise<void> => {
		await Promise.all((listeners.get(event) ?? []).map((listener) => listener(...args)));
	};
	const handle: FakeChokidarHandle = {
		add: vi.fn(),
		close: vi.fn(async () => {}),
		getWatched: vi.fn(() => ({})),
		on: vi.fn((event, listener) => {
			addListener(event, listener);
			return handle;
		}),
		once: vi.fn((event, listener) => {
			const onceListener: FakeChokidarListener = (...args) => {
				listeners.set(
					event,
					(listeners.get(event) ?? []).filter((registered) => registered !== onceListener),
				);
				return listener(...args);
			};
			addListener(event, onceListener);
			return handle;
		}),
	};
	const watch = vi.spyOn(chokidar, 'watch').mockImplementation(() => {
		if (ready === 'immediate') queueMicrotask(() => void emit('ready'));
		return handle as unknown as FSWatcher;
	});
	return { watch, handle, emit };
}

export interface FakeChokidarSubscription extends FakeChokidar {
	watcher: ProjectWatcher;
}

/**
 * Starts a `ProjectWatcher` on a fake Chokidar and resolves once its subscription is ready.
 *
 * @remarks
 * The watcher closes when the test finishes. Tests that need the startup itself, such as a late or
 * failed `ready`, call `installFakeChokidar` and `createWatcherSubscription` directly.
 */
export async function subscribeWithFakeChokidar(
	config: ProjectWatcherConfig,
	options?: FakeChokidarOptions,
): Promise<FakeChokidarSubscription> {
	const fake = installFakeChokidar(options);
	const watcher = new ProjectWatcher(config);
	onTestFinished(() => watcher.close());
	await watcher.createWatcherSubscription();
	return { ...fake, watcher };
}
