import { vi } from 'vitest';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';
import {
	InMemoryEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
} from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { ClientBridge } from '../adapters/bun/client-bridge.ts';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChange: vi.fn(async () => {}),
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
		getOutputUrl: vi.fn(() => undefined),
		getWatchedFiles: vi.fn(() => new Map()),
		getRegisteredEntrypoints: vi.fn(() => new Map()),
		getRuntimeWorkDir: vi.fn(() => ''),
		getRuntimePath: vi.fn(() => ''),
		tryHandleAssetRequest: vi.fn(() => null),
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

export const createMockBridge = (): ClientBridge =>
	({
		reload: vi.fn(() => {}),
		error: vi.fn(() => {}),
		cssUpdate: vi.fn(() => {}),
		update: vi.fn(() => {}),
		subscribe: vi.fn(() => {}),
		unsubscribe: vi.fn(() => {}),
		broadcast: vi.fn(() => {}),
		subscriberCount: 0,
	}) as unknown as ClientBridge;

/**
 * Installs the in-memory entrypoint dependency graph that the HMR managers
 * provide in dev.
 *
 * @remarks
 * `ConfigBuilder.build()` already installs the invalidation counter and a
 * no-op graph; this swaps in a graph that records dependencies.
 */
export function installDevRuntimeState(appConfig: EcoPagesAppConfig): void {
	setAppEntrypointDependencyGraph(appConfig, new InMemoryEntrypointDependencyGraph());
}
