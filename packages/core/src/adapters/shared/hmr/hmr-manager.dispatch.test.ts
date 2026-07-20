import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'vitest';
import { installBuildRuntime } from '../../../build/runtime/build-runtime.ts';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../../../hmr/hmr-strategy.ts';
import type { ClientBridgeEvent } from '../../../types/public-types.ts';
import { resolveInternalWorkDir } from '../../../utils/resolve-work-dir.ts';
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
	test('non-script file changes invalidate dev transform cache and broadcast reload', async () => {
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
	});

	test('broadcast:false suppresses reload for non-script changes', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-no-broadcast');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		using manager = await create(rootDir, spy);

		const cssFile = path.join(rootDir, 'src', 'main.css');
		fs.writeFileSync(cssFile, 'body {}\n', 'utf8');
		await manager.handleFileChange(cssFile, { broadcast: false });

		assert.equal(spy.broadcasts.length, 0);
	});

	test('defers reload broadcasts when no subscribers are connected', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-no-subscribers');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const spy = createBridgeSpy();
		spy.bridge.subscriberCount = 0;
		using manager = await create(rootDir, spy);

		const tsFile = path.join(rootDir, 'src', 'component.ts');
		fs.writeFileSync(tsFile, 'export const component = true;\n', 'utf8');
		await manager.handleFileChange(tsFile);

		assert.equal(spy.broadcasts.length, 0);
	});

	test('registered script entrypoints still route through integration strategies', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-script-strategy');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const spy = createBridgeSpy();
		using manager = await create(rootDir, spy);
		installBuildRuntime(manager.appConfig);

		const scriptPath = path.join(srcDir, 'widget.script.ts');
		fs.writeFileSync(scriptPath, 'export const widget = true;\n', 'utf8');
		const outputPath = path.join(resolveInternalWorkDir(manager.appConfig), 'assets', '_hmr', 'widget.script.js');
		manager.appConfig.runtime!.buildRuntime!.getProfile('browser-hmr').build = async () => {
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, 'fresh-output', 'utf8');
			return {
				success: true,
				logs: [],
				outputs: [{ path: outputPath }],
			};
		};

		await manager.registerScriptEntrypoint(scriptPath);

		const integrationEvent: ClientBridgeEvent = {
			type: 'update',
			path: '/assets/_hmr/widget.script.js',
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
	});
});
