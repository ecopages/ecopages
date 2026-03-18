import { vi } from 'vitest';
import type { IHmrManager } from '../internal-types';
import type { ClientBridge } from '../adapters/bun/client-bridge';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChange: vi.fn(async () => {}),
		broadcast: vi.fn(() => {}),
		setEnabled: vi.fn(() => {}),
		setPlugins: vi.fn(() => {}),
		registerEntrypoint: vi.fn(async () => ''),
		registerScriptEntrypoint: vi.fn(async () => ''),
		registerSpecifierMap: vi.fn(() => {}),
		registerStrategy: vi.fn(() => {}),
		isEnabled: vi.fn(() => true),
		getOutputUrl: vi.fn(() => undefined),
		getWatchedFiles: vi.fn(() => new Map()),
		getSpecifierMap: vi.fn(() => new Map()),
		getDistDir: vi.fn(() => ''),
		getPlugins: vi.fn(() => []),
		getDefaultContext: vi.fn(() => ({
			getWatchedFiles: () => new Map(),
			getSpecifierMap: () => new Map(),
			getDistDir: () => '',
			getPlugins: () => [],
			getSrcDir: () => '',
			getLayoutsDir: () => '',
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
