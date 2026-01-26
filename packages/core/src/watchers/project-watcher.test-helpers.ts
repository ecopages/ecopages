import { mock } from 'bun:test';
import type { IHmrManager } from '../internal-types';
import type { ClientBridge } from '../adapters/bun/client-bridge';

export const createMockHmrManager = (): IHmrManager =>
	({
		handleFileChange: mock(async () => {}),
		broadcast: mock(() => {}),
		setEnabled: mock(() => {}),
		setPlugins: mock(() => {}),
		registerEntrypoint: mock(async () => ''),
		registerSpecifierMap: mock(() => {}),
		registerStrategy: mock(() => {}),
		isEnabled: mock(() => true),
		getOutputUrl: mock(() => undefined),
		getWatchedFiles: mock(() => new Map()),
		getSpecifierMap: mock(() => new Map()),
		getDistDir: mock(() => ''),
		getPlugins: mock(() => []),
		getDefaultContext: mock(() => ({}) as any),
	}) as unknown as IHmrManager;

export const createMockBridge = (): ClientBridge =>
	({
		reload: mock(() => {}),
		error: mock(() => {}),
		cssUpdate: mock(() => {}),
		update: mock(() => {}),
		subscribe: mock(() => {}),
		unsubscribe: mock(() => {}),
		broadcast: mock(() => {}),
		subscriberCount: 0,
	}) as unknown as ClientBridge;
