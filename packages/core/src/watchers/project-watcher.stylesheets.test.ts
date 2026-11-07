import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { collectBuildEntryInputPaths } from '../build/build-graph.ts';
import { createServerBuildRequest } from '../build/runtime/build-request-policy.ts';
import { assertBuildSucceeded } from '../build/build-log.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { Processor } from '../plugins/processor.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { createTempRoot, startHmrManager, writeSourceFile } from '../adapters/shared/hmr/hmr-manager.test-helpers.ts';
import { createMockBridge, subscribeWithFakeFileSystemWatch } from './project-watcher.test-helpers.ts';

const IMPORT = /@import\s+['"](\.[^'"]+)['"]\s*;/gu;

/** Inlines relative `@import`s and reports each as a dependency, as `postcss-import` does. */
class InliningProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string, file: string) {
		const dependencies: string[] = [];
		const inlined = css.replace(IMPORT, (_statement, specifier: string) => {
			const imported = path.resolve(path.dirname(file), specifier);
			dependencies.push(imported);
			return fs.readFileSync(imported, 'utf8');
		});
		return { css: inlined, dependencies };
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

async function buildServerModule(config: EcoPagesAppConfig, entry: string): Promise<string> {
	const result = await requireAppRuntime(config).buildAdapter.build(
		createServerBuildRequest(config, {
			entrypoints: [entry],
			outdir: path.join(config.rootDir, 'out'),
			root: config.rootDir,
			writeToDisk: false,
		}),
	);
	assertBuildSucceeded(result, 'Server build failed');
	requireAppRuntime(config).buildInputIndex.register(
		{ consumer: 'server-route-module', key: entry },
		collectBuildEntryInputPaths(result, entry, config.rootDir),
	);
	return result.outputs.map((output) => output.content ?? '').join('\n');
}

describe('a stylesheet a component imports as text, when one of its partials changes', () => {
	test('hot-updates the importer with the new CSS and marks the server modules that embed it stale', async () => {
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
			processors: [
				new InliningProcessor({
					name: 'inlining',
					capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
				}),
			],
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
		expect(await buildServerModule(config, script)).toContain('--accent: red');
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
		expect(await buildServerModule(config, script)).toContain('--accent: blue');
	});
});
