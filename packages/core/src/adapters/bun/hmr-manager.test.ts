import { describe, expect, it, mock, beforeEach, afterAll, beforeAll } from 'bun:test';
import { HmrManager } from './hmr-manager';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { ClientBridge } from './client-bridge';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../../hmr/hmr-strategy';
import type { ClientBridgeEvent } from '../../public-types';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

type MockConfig = Partial<EcoPagesAppConfig>;
type MockClientBridge = Partial<ClientBridge> & {
	subscribe: ReturnType<typeof mock>;
	unsubscribe: ReturnType<typeof mock>;
	broadcast: ReturnType<typeof mock>;
};

const TMP_DIR = path.join(os.tmpdir(), 'hmr-manager-test');

const mockConfig: MockConfig = {
	absolutePaths: {
		distDir: TMP_DIR,
		srcDir: TMP_DIR,
	} as any,
};

const mockBridge: MockClientBridge = {
	subscribe: mock(),
	unsubscribe: mock(),
	broadcast: mock(),
	subscriberCount: 0,
};

class MockStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;
	matches(path: string): boolean {
		return path.endsWith('.mock');
	}
	async process(path: string): Promise<HmrAction> {
		return {
			type: 'broadcast',
			events: [{ type: 'update', path, timestamp: 123 }],
		};
	}
}

describe('HmrManager', () => {
	let manager: HmrManager;

	beforeAll(() => {
		fs.mkdirSync(TMP_DIR, { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	beforeEach(() => {
		mockBridge.broadcast = mock();
		manager = new HmrManager({
			appConfig: mockConfig as EcoPagesAppConfig,
			bridge: mockBridge as unknown as ClientBridge,
		});
	});

	it('should initialize with default strategies', async () => {
		await manager.handleFileChange('unknown.file');
		expect(mockBridge.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'reload',
				path: 'unknown.file',
			}),
		);
	});

	it('should allow registering custom strategies', async () => {
		const strategy = new MockStrategy();
		manager.registerStrategy(strategy);

		await manager.handleFileChange('test.mock');

		expect(mockBridge.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'update',
				path: 'test.mock',
			}),
		);
	});

	it('should respect strategy priority', async () => {
		const strategy = new MockStrategy();
		manager.registerStrategy(strategy);

		await manager.handleFileChange('test.mock');

		expect(mockBridge.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'update',
				path: 'test.mock',
			}),
		);
	});

	it('should broadcast events correctly', () => {
		const event: ClientBridgeEvent = { type: 'reload' };
		manager.broadcast(event);
		expect(mockBridge.broadcast).toHaveBeenCalledWith(event);
	});

	it('should manage WebSocket connections', () => {
		const handler = manager.getWebSocketHandler();
		const ws = {} as any;

		handler?.open?.(ws);
		expect(mockBridge.subscribe).toHaveBeenCalledWith(ws);

		handler?.close?.(ws, 1000, 'Test close');
		expect(mockBridge.unsubscribe).toHaveBeenCalledWith(ws);
	});

	it('should enabled/disable HMR', () => {
		expect(manager.isEnabled()).toBe(true);
		manager.setEnabled(false);
		expect(manager.isEnabled()).toBe(false);
	});
});
