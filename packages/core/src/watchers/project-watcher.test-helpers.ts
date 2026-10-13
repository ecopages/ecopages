import path from 'node:path';
import { vi } from 'vitest';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';
import type { ResolvedHmrEntrypoint } from '../types/public-types.ts';
import {
	InMemoryEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
} from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { getAppModuleLoader } from '../services/module-loading/app-server-module-transpiler.service.ts';
import { getAppBuildInputIndex } from '../build/cache/build-input-dependency-index.ts';
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
	setAppEntrypointDependencyGraph(appConfig, new InMemoryEntrypointDependencyGraph(getAppBuildInputIndex(appConfig)));
}
