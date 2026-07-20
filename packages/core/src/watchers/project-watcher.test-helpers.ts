import { vi } from 'vitest';
import type { IHmrManager } from '../types/internal-types.ts';
import type { ClientBridge } from '../adapters/bun/client-bridge.ts';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChange: vi.fn(async () => {}),
		broadcast: vi.fn(() => {}),
		setEnabled: vi.fn(() => {}),
		registerEntrypoint: vi.fn(async () => ''),
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
