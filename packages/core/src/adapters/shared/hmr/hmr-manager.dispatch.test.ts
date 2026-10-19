import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, test, vi } from 'vitest';
import { appLogger } from '../../../global/app-logger.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../../dev/transform-server/dev-transform-url.ts';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../../../hmr/hmr-strategy.ts';
import type { ClientBridgeEvent } from '../../../types/contracts.ts';
import { HmrManager } from './hmr-manager.ts';
import { createTempRoot, startHmrManagerAt } from './hmr-manager.test-helpers.ts';

class FakeHmrStrategy extends HmrStrategy {
	readonly type: HmrStrategyType;
	private readonly _matches: (filePath: string) => boolean;
	private readonly _action: HmrAction | ((filePath: string) => HmrAction);
	readonly processedFiles: string[] = [];

	constructor(
		type: HmrStrategyType,
		matchFn: (filePath: string) => boolean,
		action: HmrAction | ((filePath: string) => HmrAction),
	) {
		super();
		this.type = type;
		this._matches = matchFn;
		this._action = action;
	}

	matches(filePath: string): boolean {
		return this._matches(filePath);
	}

	async process(filePath: string): Promise<HmrAction> {
		this.processedFiles.push(filePath);
		return typeof this._action === 'function' ? this._action(filePath) : this._action;
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

function collectPendingBuildErrors(manager: HmrManager): ClientBridgeEvent[] {
	const received: ClientBridgeEvent[] = [];
	manager.sendPendingBuildErrors({ send: (payload) => received.push(JSON.parse(payload)) });
	return received;
}

describe('handleFileChanges dispatch', () => {
	test('dispatches every file in a batch and coalesces the browser update', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-batch');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const firstFile = path.join(srcDir, 'first.tsx');
		const secondFile = path.join(srcDir, 'second.tsx');
		fs.writeFileSync(firstFile, 'export const first = true;\n', 'utf8');
		fs.writeFileSync(secondFile, 'export const second = true;\n', 'utf8');
		const strategy = new FakeHmrStrategy(
			HmrStrategyType.INTEGRATION,
			(filePath) => filePath === firstFile || filePath === secondFile,
			(filePath) => ({
				type: 'broadcast',
				events: [{ type: 'update', path: `/@eco/dev/${path.basename(filePath)}`, timestamp: 1 }],
			}),
		);
		manager.registerStrategy(strategy);

		await manager.handleFileChanges([firstFile, secondFile]);

		assert.deepEqual(strategy.processedFiles, [firstFile, secondFile]);
		assert.deepEqual(broadcasts, [
			{ type: 'update', path: '/@eco/dev/first.tsx', timestamp: 1 },
			{ type: 'update', path: '/@eco/dev/second.tsx', timestamp: 1 },
		]);
	});

	test('a reload from one file in a batch replaces the updates from the others', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-reload-wins');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const firstFile = path.join(srcDir, 'first.tsx');
		const secondFile = path.join(srcDir, 'second.tsx');
		fs.writeFileSync(firstFile, 'export const first = true;\n', 'utf8');
		fs.writeFileSync(secondFile, 'export const second = true;\n', 'utf8');
		manager.registerStrategy(
			new FakeHmrStrategy(
				HmrStrategyType.INTEGRATION,
				(filePath) => filePath === firstFile || filePath === secondFile,
				(filePath) => ({
					type: 'broadcast',
					events: [
						filePath === firstFile
							? { type: 'update', path: '/@eco/dev/first.tsx', timestamp: 1 }
							: { type: 'reload' },
					],
				}),
			),
		);

		await manager.handleFileChanges([firstFile, secondFile]);

		assert.deepEqual(broadcasts, [{ type: 'reload' }]);
	});

	test('a file that fails to process does not drop the rest of the batch, and its error is sent last', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-failing-file');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const firstFile = path.join(srcDir, 'first.tsx');
		const secondFile = path.join(srcDir, 'second.tsx');
		fs.writeFileSync(firstFile, 'export const first = true;\n', 'utf8');
		fs.writeFileSync(secondFile, 'export const second = true;\n', 'utf8');
		manager.registerStrategy(
			new FakeHmrStrategy(
				HmrStrategyType.INTEGRATION,
				(filePath) => filePath === firstFile || filePath === secondFile,
				(filePath) => {
					if (filePath === firstFile) {
						throw new Error('first failed');
					}
					return {
						type: 'broadcast',
						events: [{ type: 'update', path: '/@eco/dev/second.tsx', timestamp: 1 }],
					};
				},
			),
		);

		await manager.handleFileChanges([firstFile, secondFile]);

		assert.deepEqual(broadcasts, [
			{ type: 'update', path: '/@eco/dev/second.tsx', timestamp: 1 },
			{ type: 'error', message: 'first failed' },
		]);
	});

	test('keeps the newest timestamp when a repeated client update is coalesced', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-newest-timestamp');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const firstFile = path.join(srcDir, 'first.tsx');
		const secondFile = path.join(srcDir, 'second.tsx');
		fs.writeFileSync(firstFile, 'export const first = true;\\n', 'utf8');
		fs.writeFileSync(secondFile, 'export const second = true;\\n', 'utf8');
		const strategy = new FakeHmrStrategy(
			HmrStrategyType.INTEGRATION,
			(filePath) => filePath === firstFile || filePath === secondFile,
			(filePath) => ({
				type: 'broadcast',
				events: [{ type: 'update', path: '/@eco/dev/shared.js', timestamp: filePath === firstFile ? 5 : 10 }],
			}),
		);
		manager.registerStrategy(strategy);

		await manager.handleFileChanges([firstFile, secondFile]);

		assert.deepEqual(broadcasts, [{ type: 'update', path: '/@eco/dev/shared.js', timestamp: 10 }]);
	});

	test('CSS file change routes to DefaultHmrStrategy and broadcasts reload', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-css');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const cssFile = path.join(rootDir, 'src', 'styles', 'main.css');
		fs.mkdirSync(path.dirname(cssFile), { recursive: true });
		fs.writeFileSync(cssFile, 'body {}\n', 'utf8');
		await manager.handleFileChanges([cssFile]);

		assert.equal(broadcasts.length, 1);
		assert.equal(broadcasts[0].type, 'reload');
		assert.equal(broadcasts[0].path, cssFile);
	});

	test('HTML file change routes to DefaultHmrStrategy and broadcasts reload', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-html');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const htmlFile = path.join(rootDir, 'src', 'pages', 'index.html');
		fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
		fs.writeFileSync(htmlFile, '<div>Hello</div>\n', 'utf8');
		await manager.handleFileChanges([htmlFile]);

		assert.equal(broadcasts.length, 1);
		assert.equal(broadcasts[0].type, 'reload');
		assert.equal(broadcasts[0].path, htmlFile);
	});

	test('TS file with no registered entrypoints falls through to DefaultHmrStrategy reload', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-ts-fallback');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const tsFile = path.join(srcDir, 'component.ts');
		fs.writeFileSync(tsFile, 'export const component = true;\n', 'utf8');
		await manager.handleFileChanges([tsFile]);

		assert.equal(broadcasts.length, 1);
		assert.equal(broadcasts[0].type, 'reload');
		assert.equal(broadcasts[0].path, tsFile);
	});

	test('reloads for a classic script no entrypoint imports while a module entrypoint is watched', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-classic-script');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(path.join(pagesDir, 'classic'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const moduleScript = path.join(pagesDir, 'counter.ts');
		fs.writeFileSync(moduleScript, 'export const counter = true;\n', 'utf8');
		await manager.registerScriptEntrypoint(moduleScript);
		assert.equal(manager.getWatchedFiles().size, 1);

		const classicScript = path.join(pagesDir, 'classic', 'greeting.ts');
		fs.writeFileSync(classicScript, 'function greet(name: string) {\n\treturn name;\n}\n', 'utf8');
		await manager.handleFileChanges([classicScript]);

		assert.deepEqual(broadcasts, [{ type: 'reload', path: classicScript, message: 'fallback-strategy' }]);
	});

	test('updates the entrypoint that imports a changed module once the dev transform has served it', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-served-dependency');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(path.join(pagesDir, 'lib'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const moduleScript = path.join(pagesDir, 'counter.ts');
		const direct = path.join(pagesDir, 'lib', 'direct.ts');
		const deep = path.join(pagesDir, 'lib', 'deep.ts');
		fs.writeFileSync(moduleScript, "import { direct } from './lib/direct.ts';\nconsole.log(direct);\n", 'utf8');
		fs.writeFileSync(direct, "import { deep } from './deep.ts';\nexport const direct = deep;\n", 'utf8');
		fs.writeFileSync(deep, 'export const deep = 1;\n', 'utf8');
		const { outputUrl } = await manager.registerScriptEntrypoint(moduleScript);
		const response = await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`));
		assert.equal(response?.status, 200);

		fs.writeFileSync(direct, "import { deep } from './deep.ts';\nexport const direct = deep + 1;\n", 'utf8');
		await manager.handleFileChanges([direct]);
		assert.deepEqual(broadcasts, [{ type: 'update', path: outputUrl, timestamp: broadcasts[0]?.timestamp }]);

		broadcasts.length = 0;
		fs.writeFileSync(deep, 'export const deep = 2;\n', 'utf8');
		await manager.handleFileChanges([deep]);
		assert.deepEqual(broadcasts, [{ type: 'reload', path: deep, message: 'fallback-strategy' }]);
	});

	test('broadcast:false suppresses events even when the strategy returns a broadcast action', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-no-broadcast');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const cssFile = path.join(rootDir, 'src', 'main.css');
		fs.writeFileSync(cssFile, 'body {}\n', 'utf8');
		await manager.handleFileChanges([cssFile], { broadcast: false });

		assert.equal(broadcasts.length, 0);
	});

	test.each<{ scenario: string; action: HmrAction }>([
		{
			scenario: 'strategy events',
			action: {
				type: 'broadcast',
				events: [{ type: 'update', path: `${DEV_TRANSFORM_URL_PREFIX}/dropped.js`, timestamp: 1 }],
			},
		},
		{ scenario: 'the fallback reload', action: { type: 'none' } },
	])('drops $scenario and says so when no browser is connected', async ({ action }) => {
		const rootDir = createTempRoot('ecopages-dispatch-no-subscribers');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 0);
		const debugSpy = vi.spyOn(appLogger, 'debug').mockReturnValue(appLogger);

		const changedFile = path.join(rootDir, 'src', 'dropped.ts');
		fs.writeFileSync(changedFile, 'export const dropped = true;\n', 'utf8');
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === changedFile, action),
		);

		await manager.handleFileChanges([changedFile]);

		assert.deepEqual(broadcasts, []);
		assert.deepEqual(collectPendingBuildErrors(manager), []);
		assert.ok(
			debugSpy.mock.calls.some(([message]) =>
				String(message).endsWith(`No browser connected; dropping HMR events for ${changedFile}`),
			),
		);
	});

	test('reloads a connected browser when a strategy returns no events for an unregistered file', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-fallback-reload');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const changedFile = path.join(rootDir, 'src', 'fallback.ts');
		fs.writeFileSync(changedFile, 'export const fallback = true;\n', 'utf8');
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === changedFile, { type: 'none' }),
		);

		await manager.handleFileChanges([changedFile]);

		assert.deepEqual(broadcasts, [{ type: 'reload' }]);
	});

	test('registered script entrypoints still route through integration strategies', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-script-strategy');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

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

		await manager.handleFileChanges([scriptPath]);

		assert.equal(broadcasts.length, 1);
		assert.deepEqual(broadcasts[0], integrationEvent);
		assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/widget.script.js`);
	});

	test('INTEGRATION strategy wins over DefaultHmrStrategy for matched files', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-integration-priority');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const customFile = path.join(rootDir, 'src', 'component.jsx');
		fs.writeFileSync(customFile, 'export default null;\n', 'utf8');
		const integrationEvent: ClientBridgeEvent = {
			type: 'update',
			path: `${DEV_TRANSFORM_URL_PREFIX}/component.js`,
			timestamp: 1,
		};
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === customFile, {
				type: 'broadcast',
				events: [integrationEvent],
			}),
		);

		await manager.handleFileChanges([customFile]);

		assert.equal(broadcasts.length, 1);
		assert.deepEqual(broadcasts[0], integrationEvent);
	});

	test('action.type none suppresses broadcast for registered entrypoints', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-none-action');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const scriptPath = path.join(srcDir, 'silent.script.ts');
		fs.writeFileSync(scriptPath, 'export const silent = true;\n', 'utf8');
		await manager.registerScriptEntrypoint(scriptPath);
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === scriptPath, { type: 'none' }),
		);

		await manager.handleFileChanges([scriptPath]);

		assert.equal(broadcasts.length, 0);
	});

	test('all events returned by a strategy are each broadcast individually', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-multi-event');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const customFile = path.join(rootDir, 'src', 'multi.ts');
		fs.writeFileSync(customFile, 'export const multi = true;\n', 'utf8');
		const events: ClientBridgeEvent[] = [
			{ type: 'update', path: `${DEV_TRANSFORM_URL_PREFIX}/a.js`, timestamp: 1 },
			{ type: 'update', path: `${DEV_TRANSFORM_URL_PREFIX}/b.js`, timestamp: 2 },
		];
		manager.registerStrategy(
			new FakeHmrStrategy(HmrStrategyType.INTEGRATION, (filePath) => filePath === customFile, {
				type: 'broadcast',
				events,
			}),
		);

		await manager.handleFileChanges([customFile]);

		assert.equal(broadcasts.length, 2);
		assert.deepEqual(broadcasts, events);
	});

	test('broadcasts a dev-transform build error to the browser without terminal colour codes', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-build-error');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager, broadcasts } = await startHmrManagerAt(rootDir, 1);

		const scriptPath = path.join(srcDir, 'broken.script.ts');
		fs.writeFileSync(scriptPath, 'export const broken = ;\n', 'utf8');
		const { outputUrl } = await manager.registerScriptEntrypoint(scriptPath);

		const response = await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`));

		assert.equal(response?.status, 500);
		assert.equal(broadcasts.length, 1);
		assert.equal(broadcasts[0].type, 'error');
		assert.match(broadcasts[0].message ?? '', /PARSE_ERROR/);
		assert.match(broadcasts[0].message ?? '', /broken\.script\.ts/);
		assert.equal(broadcasts[0].message?.includes('\u001b['), false);
	});

	test('sends a build error to a browser that connects after it was broadcast', async () => {
		const rootDir = createTempRoot('ecopages-dispatch-late-build-error');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager } = await startHmrManagerAt(rootDir, 0);

		const scriptPath = path.join(srcDir, 'late.script.ts');
		fs.writeFileSync(scriptPath, 'export const late = ;\n', 'utf8');
		const { outputUrl } = await manager.registerScriptEntrypoint(scriptPath);
		await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`));

		const received = collectPendingBuildErrors(manager);

		assert.equal(received.length, 1);
		assert.equal(received[0].type, 'error');
		assert.match(received[0].message ?? '', /late\.script\.ts/);
	});

	test.each([
		{
			scenario: 'a dependency of another script is saved',
			change: (scriptPath: string) => path.join(path.dirname(scriptPath), 'dependency.ts'),
		},
		{
			scenario: 'the failing script is removed',
			change: (scriptPath: string) => {
				fs.rmSync(scriptPath);
				return scriptPath;
			},
		},
	])('stops sending a recorded build error once $scenario', async ({ change }) => {
		const rootDir = createTempRoot('ecopages-dispatch-cleared-build-error');
		const srcDir = path.join(rootDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		const { manager } = await startHmrManagerAt(rootDir, 0);

		const dependencyPath = path.join(srcDir, 'dependency.ts');
		fs.writeFileSync(dependencyPath, 'export const dependency = true;\n', 'utf8');
		const otherPath = path.join(srcDir, 'other.script.ts');
		fs.writeFileSync(
			otherPath,
			"import { dependency } from './dependency.ts';\nconsole.log(dependency);\n",
			'utf8',
		);
		const other = await manager.registerScriptEntrypoint(otherPath);
		await manager.tryHandleDevClientRequest(new Request(`http://localhost${other.outputUrl}`));

		const scriptPath = path.join(srcDir, 'cleared.script.ts');
		fs.writeFileSync(scriptPath, 'export const cleared = ;\n', 'utf8');
		const { outputUrl } = await manager.registerScriptEntrypoint(scriptPath);
		await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`));
		assert.equal(collectPendingBuildErrors(manager).length, 1);

		await manager.handleFileChanges([change(scriptPath)], { broadcast: false });

		assert.deepEqual(collectPendingBuildErrors(manager), []);
	});
});
