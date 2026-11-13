import fs from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { importViewModule } from '../build/server/import-view-module.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { StylesheetInvalidation } from '../plugins/processor.ts';
import { InliningProcessor } from '../__fixtures__/stylesheets/inlining-processor.ts';
import { ScopingProcessor } from '../__fixtures__/stylesheets/scoping-processor.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { createTempRoot, startHmrManager, writeSourceFile } from '../adapters/shared/hmr/hmr-manager.test-helpers.ts';
import { createMockBridge, subscribeWithFakeFileSystemWatch } from './project-watcher.test-helpers.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * Imports `entry` the way a Page render does, through the app module loader, which caches the server module and
 * records its inputs, and returns its default export.
 */
async function renderServerModule(config: EcoPagesAppConfig, entry: string): Promise<string> {
	const module = await importViewModule<{ default: string }>(config, entry);
	return module.default;
}

describe('a stylesheet a component imports as text, when one of its partials changes', () => {
	test('hot-updates the importer with the new CSS and marks the server modules that embed it stale', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const rootDir = fs.realpathSync(createTempRoot('ecopages-watcher-stylesheet-partial'));
		const tokens = writeSourceFile(rootDir, 'src/components/tokens.css', ':root { --accent: red; }\n');
		writeSourceFile(
			rootDir,
			'src/components/card.css',
			"@import './tokens.css';\n.card { color: var(--accent); }\n",
		);
		const script = writeSourceFile(
			rootDir,
			'src/components/card.script.ts',
			"import styles from './card.css';\nexport default styles;\n",
		);
		const config = await finalizeEcoPagesConfig({
			rootDir,
			integrations: [],
			processors: [new InliningProcessor()],
		});
		const { manager, broadcasts } = startHmrManager(config, 1);
		const { emit } = await subscribeWithFakeFileSystemWatch({
			config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: manager,
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});
		const { outputUrl } = await manager.registerScriptEntrypoint(script);
		const request = async (url: string) =>
			(await manager.tryHandleDevClientRequest(new Request(`http://localhost${url}`)))?.text();
		const stylesheetImport = async () =>
			/from ['"]([^'"]+card\.css\?v=[^'"]+)['"]/u.exec((await request(outputUrl)) ?? '')?.[1];
		const before = await stylesheetImport();
		expect(await request(before!)).toContain('--accent: red');
		expect(await renderServerModule(config, script)).toContain('--accent: red');
		const serverGeneration = requireAppRuntime(config).serverInvalidation.currentGeneration();

		fs.writeFileSync(tokens, ':root { --accent: blue; }\n');
		await emit('change', tokens);

		await vi.waitFor(() =>
			expect(broadcasts).toContainEqual(expect.objectContaining({ type: 'update', path: outputUrl })),
		);
		expect(broadcasts.some((event) => event.type === 'reload')).toBe(false);
		const after = await stylesheetImport();
		expect(after).not.toBe(before);
		expect(await request(after!)).toContain('--accent: blue');
		expect(requireAppRuntime(config).serverInvalidation.currentGeneration()).toBeGreaterThan(serverGeneration);
		expect(await renderServerModule(config, script)).toContain('--accent: blue');
	});
});

/** An {@link InliningProcessor} that invalidates every entry stylesheet for a content change and appends `extra`. */
class ContentScanningProcessor extends InliningProcessor {
	extra = '';

	override invalidateStylesheets(): StylesheetInvalidation {
		return 'all';
	}

	override async transformStylesheet(css: string, file: string) {
		const result = await super.transformStylesheet(css, file);
		return { ...result, css: `${result.css}${this.extra}` };
	}
}

describe('a stylesheet a component imports as text, when content its Processor scans changes', () => {
	test('hot-updates the importer with the CSS the invalidation hook asked for', async () => {
		const rootDir = fs.realpathSync(createTempRoot('ecopages-watcher-stylesheet-content'));
		writeSourceFile(rootDir, 'src/components/card.css', '.card { color: red; }\n');
		const template = writeSourceFile(rootDir, 'src/components/template.ts', 'export const a = 1;\n');
		const script = writeSourceFile(
			rootDir,
			'src/components/card.script.ts',
			"import styles from './card.css';\nimport { a } from './template.ts';\nexport default [styles, a];\n",
		);
		const processor = new ContentScanningProcessor();
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
		const { manager, broadcasts } = startHmrManager(config, 1);
		const { emit } = await subscribeWithFakeFileSystemWatch({
			config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: manager,
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});
		const { outputUrl } = await manager.registerScriptEntrypoint(script);
		const request = async (url: string) =>
			(await manager.tryHandleDevClientRequest(new Request(`http://localhost${url}`)))?.text();
		const stylesheetImport = async () =>
			/from ['"]([^'"]+card\.css\?v=[^'"]+)['"]/u.exec((await request(outputUrl)) ?? '')?.[1];
		const before = await stylesheetImport();
		await request(before!);

		processor.extra = '.scanned { color: blue; }\n';
		fs.writeFileSync(template, 'export const a = 2;\n');
		await emit('change', template);

		await vi.waitFor(() =>
			expect(broadcasts).toContainEqual(expect.objectContaining({ type: 'update', path: outputUrl })),
		);
		const after = await stylesheetImport();
		expect(after).not.toBe(before);
		expect(await request(after!)).toContain('.scanned');
	});
});

describe('a CSS Module a component imports', () => {
	async function setup() {
		vi.stubEnv('NODE_ENV', 'development');
		const rootDir = fs.realpathSync(createTempRoot('ecopages-watcher-css-module'));
		const module = writeSourceFile(rootDir, 'src/components/card.module.css', '.card { color: red; }\n');
		const script = writeSourceFile(
			rootDir,
			'src/components/card.script.ts',
			"import styles from './card.module.css';\nexport default styles;\n",
		);
		const processor = new ScopingProcessor();
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
		processor.setContext(config);
		const { manager, broadcasts } = startHmrManager(config, 1);
		const bridge = createMockBridge();
		const { emit } = await subscribeWithFakeFileSystemWatch({
			config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: manager,
			bridge,
			changeDebounceMs: 0,
		});
		const { outputUrl } = await manager.registerScriptEntrypoint(script);
		const request = async (url: string) =>
			(await manager.tryHandleDevClientRequest(new Request(`http://localhost${url}`)))?.text();
		const classMapUrl = /from ['"]([^'"]+card\.module\.css\?v=[^'"]+)['"]/u.exec(
			(await request(outputUrl)) ?? '',
		)?.[1];
		expect(await request(classMapUrl!)).toContain('"card":');
		return { module, bridge, broadcasts, emit, outputUrl };
	}

	test('refreshes the delivered stylesheet and leaves the importer alone when only the CSS changes', async () => {
		const { module, bridge, broadcasts, emit, outputUrl } = await setup();

		fs.writeFileSync(module, '.card { color: blue; }\n');
		await emit('change', module);

		await vi.waitFor(() => expect(bridge.cssUpdate).toHaveBeenCalledWith(module));
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(broadcasts.some((event) => event.type === 'update' && event.path === outputUrl)).toBe(false);
		expect(broadcasts.some((event) => event.type === 'reload')).toBe(false);
	});

	test('hot-updates the importer when the class map changes', async () => {
		const { module, bridge, broadcasts, emit, outputUrl } = await setup();

		fs.writeFileSync(module, '.card { color: red; }\n.title { color: blue; }\n');
		await emit('change', module);

		await vi.waitFor(() =>
			expect(broadcasts).toContainEqual(expect.objectContaining({ type: 'update', path: outputUrl })),
		);
		expect(bridge.cssUpdate).toHaveBeenCalledWith(module);
		expect(broadcasts.some((event) => event.type === 'reload')).toBe(false);
	});
});
