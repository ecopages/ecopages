import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../../dev/transform-server/dev-transform-url.ts';
import { HmrManager as BunHmrManager } from '../../adapters/bun/hmr-manager.ts';
import type { ClientBridgeEvent } from '../../types/public-types.ts';
import { resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';

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

async function readDevTransformModule(manager: BunHmrManager, entrypointPath: string): Promise<string | undefined> {
	const outputUrl = manager.getOutputUrl(entrypointPath);
	if (!outputUrl) {
		return undefined;
	}

	const response = await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`));
	if (!response?.ok) {
		return undefined;
	}

	return response.text();
}

describe('JsHmrStrategy integration', () => {
	it('rebuilds a registered integration-suffixed script entrypoint on source change', async () => {
		const rootDir = createTempRoot('js-hmr-integration');
		const componentsDir = path.join(rootDir, 'src', 'components', 'script-hmr');
		fs.mkdirSync(componentsDir, { recursive: true });

		const entrypointPath = path.join(componentsDir, 'widget.script.eco.tsx');
		const writeMarker = (marker: string) => {
			fs.writeFileSync(
				entrypointPath,
				`export const marker = ${JSON.stringify(marker)};\nconsole.log(${JSON.stringify(marker)});\n`,
				'utf8',
			);
		};

		writeMarker('BASELINE');

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		config.templatesExt = ['.eco.tsx'];

		const broadcasts: ClientBridgeEvent[] = [];
		using manager = new BunHmrManager({
			appConfig: config,
			bridge: {
				subscriberCount: 1,
				broadcast: (event: ClientBridgeEvent) => {
					broadcasts.push(event);
				},
			} as never,
		});

		manager.setEnabled(true);
		installBuildRuntime(config);

		await manager.registerScriptEntrypoint(entrypointPath);

		expect(manager.getWatchedFiles().has(path.resolve(entrypointPath))).toBe(true);
		expect(manager.getOutputUrl(entrypointPath)).toBe(
			`${DEV_TRANSFORM_URL_PREFIX}/components/script-hmr/widget.script.eco.js`,
		);

		const legacyOutputPath = path.join(
			resolveInternalWorkDir(config),
			'assets',
			'_hmr',
			'components',
			'script-hmr',
			'widget.script.eco.js',
		);
		expect(fs.existsSync(legacyOutputPath)).toBe(false);

		expect(await readDevTransformModule(manager, entrypointPath)).toContain('BASELINE');

		writeMarker('UPDATED');
		broadcasts.length = 0;
		await manager.handleFileChange(entrypointPath);

		expect(broadcasts.length).toBeGreaterThan(0);
		expect(await readDevTransformModule(manager, entrypointPath)).toContain('UPDATED');
		expect(broadcasts.some((event) => event.type === 'reload' || event.type === 'update')).toBe(true);
	});

	it('rebuilds a registered script entrypoint without server-importing it', async () => {
		const rootDir = createTempRoot('js-hmr-browser-script');
		const layoutsDir = path.join(rootDir, 'src', 'layouts', 'base-layout');
		fs.mkdirSync(layoutsDir, { recursive: true });

		const entrypointPath = path.join(layoutsDir, 'base-layout.script.ts');
		const writeMarker = (marker: string) => {
			fs.writeFileSync(
				entrypointPath,
				`const marker = ${JSON.stringify(marker)};\nif (typeof document !== 'undefined') {\n  document.documentElement.dataset.baseLayoutScript = marker;\n}\n`,
				'utf8',
			);
		};

		writeMarker('BASELINE');

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		const broadcasts: ClientBridgeEvent[] = [];
		let importCalls = 0;
		config.runtime ??= {};
		config.runtime.appModuleLoader = {
			importModule: async () => {
				importCalls += 1;
				throw new Error('browser-only registered scripts must not be server-imported');
			},
			invalidateDevelopmentGraph: () => undefined,
		} as never;

		using manager = new BunHmrManager({
			appConfig: config,
			bridge: {
				subscriberCount: 1,
				broadcast: (event: ClientBridgeEvent) => {
					broadcasts.push(event);
				},
			} as never,
		});

		manager.setEnabled(true);
		installBuildRuntime(config);

		await manager.registerScriptEntrypoint(entrypointPath);

		expect(manager.getOutputUrl(entrypointPath)).toBe(
			`${DEV_TRANSFORM_URL_PREFIX}/layouts/base-layout/base-layout.script.js`,
		);

		const legacyOutputPath = path.join(
			resolveInternalWorkDir(config),
			'assets',
			'_hmr',
			'layouts',
			'base-layout',
			'base-layout.script.js',
		);
		expect(fs.existsSync(legacyOutputPath)).toBe(false);
		expect(await readDevTransformModule(manager, entrypointPath)).toContain('BASELINE');

		writeMarker('UPDATED');
		broadcasts.length = 0;
		await manager.handleFileChange(entrypointPath);

		expect(importCalls).toBe(0);
		expect(broadcasts.some((event) => event.type === 'update')).toBe(true);
		expect(broadcasts.some((event) => event.type === 'reload')).toBe(false);
		expect(broadcasts.length).toBeGreaterThan(0);
		expect(await readDevTransformModule(manager, entrypointPath)).toContain('UPDATED');
	});

	it('broadcasts reload for registered .script.tsx entrypoint edits', async () => {
		const rootDir = createTempRoot('js-hmr-script-tsx-reload');
		const componentsDir = path.join(rootDir, 'src', 'components', 'script-hmr');
		fs.mkdirSync(componentsDir, { recursive: true });

		const entrypointPath = path.join(componentsDir, 'widget.script.tsx');
		fs.writeFileSync(entrypointPath, `export const marker = "BASELINE";\nconsole.log("BASELINE");\n`, 'utf8');

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		const broadcasts: ClientBridgeEvent[] = [];
		config.runtime ??= {};
		config.runtime.registeredScriptEntrypointChangeHandlers = [() => true];
		using manager = new BunHmrManager({
			appConfig: config,
			bridge: {
				subscriberCount: 1,
				broadcast: (event: ClientBridgeEvent) => {
					broadcasts.push(event);
				},
			} as never,
		});

		manager.setEnabled(true);
		installBuildRuntime(config);

		await manager.registerScriptEntrypoint(entrypointPath);
		broadcasts.length = 0;

		fs.writeFileSync(entrypointPath, `export const marker = "UPDATED";\nconsole.log("UPDATED");\n`, 'utf8');
		await manager.handleFileChange(entrypointPath);

		expect(broadcasts).toEqual([{ type: 'reload' }]);
	});
});
