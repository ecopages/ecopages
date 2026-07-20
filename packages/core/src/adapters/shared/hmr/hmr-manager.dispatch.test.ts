import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'vitest';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../../../hmr/hmr-strategy.ts';
import type { ClientBridgeEvent } from '../../../types/public-types.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../../dev/transform-server/dev-transform-url.ts';
import { HmrManager as BunHmrManager } from '../../bun/hmr-manager.ts';
import { NodeHmrManager } from '../../node/node-hmr-manager.ts';

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
		subscriberCount: 1,
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
		using manager = await create(rootDir, spy);

		const cssFile = path.join(rootDir, 'src', 'styles', 'main.css');
		fs.mkdirSync(path.dirname(cssFile), { recursive: true });
		fs.writeFileSync(cssFile, 'body {}\n', 'utf8');
		await manager.handleFileChange(cssFile);

		assert.equal(spy.broadcasts.length, 1);
		assert.equal(spy.broadcasts[0].type, 'reload');
		assert.equal(spy.broadcasts[0].path, cssFile);
	});

	test('broadcast:false suppresses events even when the strategy returns a broadcast action', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-no-broadcast');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		using manager = await create(rootDir, spy);

		const cssFile = path.join(rootDir, 'src', 'main.css');
		fs.writeFileSync(cssFile, 'body {}\n', 'utf8');
		await manager.handleFileChange(cssFile, { broadcast: false });

		assert.equal(spy.broadcasts.length, 0);
	});

	test('defers client rebuilds when no subscribers are connected', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-no-subscribers');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		spy.bridge.subscriberCount = 0;
		using manager = await create(rootDir, spy);

		const customFile = path.join(rootDir, 'src', 'deferred.ts');
		fs.writeFileSync(customFile, 'export const deferred = true;\n', 'utf8');
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === customFile, {
				type: 'broadcast',
				events: [{ type: 'update', path: '/assets/_hmr/deferred.js', timestamp: 1 }],
			}),
		);

		await manager.handleFileChange(customFile);

		assert.equal(spy.broadcasts.length, 0);
	});

	test('registered script entrypoints still route through integration strategies', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-script-strategy');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const spy = createBridgeSpy();
		using manager = await create(rootDir, spy);

		const scriptPath = path.join(srcDir, 'widget.script.ts');
		fs.writeFileSync(scriptPath, 'export const widget = true;\n', 'utf8');

		const registered = await manager.registerScriptEntrypoint(scriptPath);
		const outputUrl = registered.outputUrl;

		const integrationEvent: ClientBridgeEvent = {
			type: 'update',
			path: outputUrl,
			timestamp: 1,
		};
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === scriptPath, {
				type: 'broadcast',
				events: [integrationEvent],
			}),
		);

		await manager.handleFileChange(scriptPath);

		assert.equal(spy.broadcasts.length, 1);
		assert.deepEqual(spy.broadcasts[0], integrationEvent);
		assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/widget.script.js`);
	});
});
