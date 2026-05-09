import { vi } from 'vitest';
import type { IHmrManager } from '../types/internal-types.ts';
import type { ClientBridge } from '../adapters/bun/client-bridge.ts';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChange: vi.fn(async () => {}),
		broadcast: vi.fn(() => {}),
		setEnabled: vi.fn(() => {}),
		setPlugins: vi.fn(() => {}),
		registerEntrypoint: vi.fn(async () => ''),
		registerScriptEntrypoint: vi.fn(async () => ''),
		registerStrategy: vi.fn(() => {}),
		isEnabled: vi.fn(() => true),
		getOutputUrl: vi.fn(() => undefined),
		getWatchedFiles: vi.fn(() => new Map()),
		getDistDir: vi.fn(() => ''),
		getPlugins: vi.fn(() => []),
		getDefaultContext: vi.fn(() => ({
			getWatchedFiles: () => new Map(),
			getDistDir: () => '',
			getPlugins: () => [],
			getSrcDir: () => '',
			getLayoutsDir: () => '',
			getPagesDir: () => '',
			getBuildExecutor: () => ({ build: vi.fn(async () => ({ success: true, logs: [], outputs: [] })) }),
			getBrowserBundleService: () => ({ bundle: vi.fn(async () => ({ success: true, logs: [], outputs: [] })) }),
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
