import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'vitest';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../../hmr/hmr-strategy.ts';
import type { ClientBridgeEvent } from '../../types/public-types.ts';
import { HmrManager as BunHmrManager } from '../bun/hmr-manager.ts';
import { NodeHmrManager } from '../node/node-hmr-manager.ts';

class FakeHmrStrategy extends HmrStrategy {
	readonly type: HmrStrategyType;
	private readonly _matches: (filePath: string) => boolean;
	private readonly _action: HmrAction;

	constructor(type: HmrStrategyType, matchFn: (f: string) => boolean, action: HmrAction) {
		super();
		this.type = type;
		this._matches = matchFn;
		this._action = action;
	}

	matches(filePath: string): boolean {
		return this._matches(filePath);
	}

	async process(_filePath: string): Promise<HmrAction> {
		return this._action;
	}
}

type BridgeSpy = {
	broadcasts: ClientBridgeEvent[];
	bridge: {
		subscriberCount: number;
		broadcast(event: ClientBridgeEvent): void;
		subscribe(): void;
		unsubscribe(): void;
	};
};

function createBridgeSpy(): BridgeSpy {
	const broadcasts: ClientBridgeEvent[] = [];
	const bridge = {
		subscriberCount: 0,
		broadcast(event: ClientBridgeEvent) {
			broadcasts.push(event);
		},
		subscribe() {},
		unsubscribe() {},
	};
	return { broadcasts, bridge };
}

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

const runtimes = [
	{
		name: 'node',
		async create(rootDir: string, bridgeSpy: BridgeSpy) {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return new NodeHmrManager({ appConfig: config, bridge: bridgeSpy.bridge as any });
		},
	},
	{
		name: 'bun',
		async create(rootDir: string, bridgeSpy: BridgeSpy) {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return new BunHmrManager({ appConfig: config, bridge: bridgeSpy.bridge as any });
		},
	},
] as const;

describe.each(runtimes)('handleFileChange dispatch: $name', ({ create }) => {
	test('CSS file change routes to DefaultHmrStrategy and broadcasts reload', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-css');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const cssFile = path.join(rootDir, 'src', 'styles', 'main.css');
		await manager.handleFileChange(cssFile);

		assert.equal(spy.broadcasts.length, 1);
		assert.equal(spy.broadcasts[0].type, 'reload');
		assert.equal(spy.broadcasts[0].path, cssFile);

		manager.stop();
	});

	test('HTML file change routes to DefaultHmrStrategy and broadcasts reload', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-html');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const htmlFile = path.join(rootDir, 'src', 'pages', 'index.html');
		await manager.handleFileChange(htmlFile);

		assert.equal(spy.broadcasts.length, 1);
		assert.equal(spy.broadcasts[0].type, 'reload');
		assert.equal(spy.broadcasts[0].path, htmlFile);

		manager.stop();
	});

	test('TS file with no registered entrypoints falls back to DefaultHmrStrategy reload', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-ts-fallback');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const tsFile = path.join(srcDir, 'component.ts');
		await manager.handleFileChange(tsFile);

		assert.equal(spy.broadcasts.length, 1);
		assert.equal(spy.broadcasts[0].type, 'reload');

		manager.stop();
	});

	test('broadcast:false suppresses events even when the strategy returns a broadcast action', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-no-broadcast');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const cssFile = path.join(rootDir, 'src', 'main.css');
		await manager.handleFileChange(cssFile, { broadcast: false });

		assert.equal(spy.broadcasts.length, 0);

		manager.stop();
	});

	test('INTEGRATION strategy wins over DefaultHmrStrategy for matched files', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-integration-priority');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const customFile = path.join(rootDir, 'src', 'component.jsx');
		const integrationEvent: ClientBridgeEvent = {
			type: 'update',
			path: '/assets/_hmr/component.js',
			timestamp: 1,
		};
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (f) => f === customFile, {
				type: 'broadcast',
				events: [integrationEvent],
			}),
		);

		await manager.handleFileChange(customFile);

		assert.equal(spy.broadcasts.length, 1);
		assert.deepEqual(spy.broadcasts[0], integrationEvent);

		manager.stop();
	});

	test('action.type none suppresses broadcast even when shouldBroadcast is true', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-none-action');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const customFile = path.join(rootDir, 'src', 'silent.ts');
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (f) => f === customFile, { type: 'none' }),
		);

		await manager.handleFileChange(customFile);

		assert.equal(spy.broadcasts.length, 0);

		manager.stop();
	});

	test('all events returned by a strategy are each broadcast individually', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-multi-event');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		const manager = await create(rootDir, spy);

		const customFile = path.join(rootDir, 'src', 'multi.ts');
		const events: ClientBridgeEvent[] = [
			{ type: 'update', path: '/assets/_hmr/a.js', timestamp: 1 },
			{ type: 'update', path: '/assets/_hmr/b.js', timestamp: 2 },
		];
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (f) => f === customFile, {
				type: 'broadcast',
				events,
			}),
		);

		await manager.handleFileChange(customFile);

		assert.equal(spy.broadcasts.length, 2);
		assert.deepEqual(spy.broadcasts, events);

		manager.stop();
	});
});
