import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPlugin,
	EcoBuildPluginBuilder,
} from '@ecopages/core/integration';
import { createClientGraphBoundaryPlugin } from './boundary-plugin.ts';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { getBuildEntryOutput } from '../../../../core/src/build/build-graph.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';

type OnLoadRegistration = {
	options: { filter: RegExp; exclude?: RegExp };
	callback: (
		args: EcoBuildOnLoadArgs,
	) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;
};

function createPluginTestHarness(
	pluginOptions?: Parameters<typeof createClientGraphBoundaryPlugin>[0],
	entrypoints?: Readonly<Record<string, string>>,
) {
	const onLoadRegistrations: OnLoadRegistration[] = [];
	const builder: EcoBuildPluginBuilder = {
		...(entrypoints ? { entrypoints } : {}),
		onResolve: (_options, _callback: (args: EcoBuildOnResolveArgs) => EcoBuildOnResolveResult | undefined) => {},
		onLoad: (options, callback) => {
			onLoadRegistrations.push({ options, callback });
		},
		module: (_specifier, _callback) => {},
		transform: () => {},
		onEnd: () => {},
		addWatchFile: () => {},
	};

	const plugin = createClientGraphBoundaryPlugin(pluginOptions);
	plugin.setup(builder);

	const sourceLoader = onLoadRegistrations.find(({ options }) => options.filter.test('component.tsx'));
	if (!sourceLoader) {
		throw new Error('Source loader was not registered by client graph boundary plugin');
	}

	return {
		async transformFile(filePath: string): Promise<string | undefined> {
			const result = await sourceLoader.callback({ path: filePath });
			if (!result || typeof result.contents !== 'string') {
				return undefined;
			}
			return result.contents;
		},
	};
}

/**
 * Evaluates a transformed plain-JavaScript fixture and returns its default export's `render()` result.
 */
async function renderTransformed(tempDir: string, name: string, transformed: string): Promise<unknown> {
	const outputPath = join(tempDir, `${name}.transformed.mjs`);
	writeFileSync(outputPath, transformed);
	const module = (await import(pathToFileURL(outputPath).href)) as { default: { render: () => unknown } };
	return module.default.render();
}

async function withTempDir(run: (tempDir: string) => Promise<void>): Promise<void> {
	const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-client-graph-')));
	try {
		await run(tempDir);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

describe('createClientGraphBoundaryPlugin', () => {
	it('keeps the standalone boundary for builds with an entrypoint map', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const entrypoint = join(tempDir, 'entry.tsx');
		writeFileSync(entrypoint, "import fs from 'node:fs';\nexport default () => 'ok';", 'utf-8');

		try {
			const harness = createPluginTestHarness(undefined, { entry: entrypoint });
			const transformed = await harness.transformFile(entrypoint);

			expect(transformed).toBeDefined();
			expect(transformed).not.toContain("import fs from 'node:fs';");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('preserves side-effect imports in helpers shared with non-React entries', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const htmlEntrypoint = join(tempDir, 'html-entry.ts');
		const reactEntrypoint = join(tempDir, 'react-entry.tsx');
		const sharedHelper = join(tempDir, 'helper.ts');
		const registration = join(tempDir, 'register.ts');
		writeFileSync(htmlEntrypoint, "import { register } from './helper.ts';\nregister();", 'utf-8');
		writeFileSync(reactEntrypoint, "import { register } from './helper.ts';\nexport default register;", 'utf-8');
		writeFileSync(sharedHelper, "import './register.ts';\nexport function register() {}", 'utf-8');
		writeFileSync(registration, 'globalThis.registered = true;', 'utf-8');

		try {
			const harness = createPluginTestHarness(
				{
					absWorkingDir: tempDir,
					projectRoot: tempDir,
					entrypointFile: reactEntrypoint,
					groupedEntrypointFiles: [reactEntrypoint],
				},
				{ html: htmlEntrypoint, react: reactEntrypoint },
			);
			const transformed = await harness.transformFile(sharedHelper);

			expect(transformed).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('scopes declared modules to their grouped entry', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const islandA = join(tempDir, 'island-a.tsx');
		const islandB = join(tempDir, 'island-b.tsx');
		const sharedHelper = join(tempDir, 'shared-helper.ts');
		const writeIsland = (filePath: string, serverOnly: string, render: string) =>
			writeFileSync(
				filePath,
				[
					"import fs from 'node:fs';",
					"import path from 'node:path';",
					"import crypto from 'node:crypto';",
					'const eco = { page: (options) => options };',
					`export default eco.page({ middleware: [${serverOnly}], render: () => ${render} });`,
				].join('\n'),
				'utf-8',
			);
		writeIsland(islandA, 'fs, crypto', "path.basename('/a/b')");
		writeIsland(islandB, 'path, crypto', 'typeof fs.readFileSync');
		writeIsland(sharedHelper, 'crypto', "path.basename('/a/c') + typeof fs.readFileSync");

		const registrations: OnLoadRegistration[] = [];
		const groupedEntrypointFiles = [islandA, islandB];
		const builder: EcoBuildPluginBuilder = {
			onResolve: () => {},
			onLoad: (options, callback) => registrations.push({ options, callback }),
			module: () => {},
			transform: () => {},
			onEnd: () => {},
			addWatchFile: () => {},
		};

		try {
			for (const plugin of [
				createClientGraphBoundaryPlugin({
					entrypointFile: islandA,
					groupedEntrypointFiles,
					groupedDeclaredModules: ['node:fs', 'node:path'],
					declaredModules: ['node:path'],
				}),
				createClientGraphBoundaryPlugin({
					entrypointFile: islandB,
					groupedEntrypointFiles,
					groupedDeclaredModules: ['node:fs', 'node:path'],
					declaredModules: ['node:fs'],
				}),
			]) {
				await plugin.setup(builder);
			}

			const transformEntry = async (filePath: string): Promise<string> => {
				for (const registration of registrations) {
					if (!registration.options.filter.test(filePath)) continue;
					const result = await registration.callback({ path: filePath });
					if (typeof result?.contents === 'string') return result.contents;
				}
				return readFileSync(filePath, 'utf-8');
			};

			const transformedIslandA = await transformEntry(islandA);
			expect(transformedIslandA).not.toContain("from 'node:fs'");
			expect(transformedIslandA).toContain("from 'node:path'");
			expect(transformedIslandA).not.toContain("from 'node:crypto'");
			expect(await renderTransformed(tempDir, 'island-a', transformedIslandA)).toBe('b');
			const transformedIslandB = await transformEntry(islandB);
			expect(transformedIslandB).toContain("from 'node:fs'");
			expect(transformedIslandB).not.toContain("from 'node:path'");
			expect(transformedIslandB).not.toContain("from 'node:crypto'");
			expect(await renderTransformed(tempDir, 'island-b', transformedIslandB)).toBe('function');
			const transformedHelper = await transformEntry(sharedHelper);
			expect(transformedHelper).toContain("from 'node:fs'");
			expect(transformedHelper).toContain("from 'node:path'");
			expect(transformedHelper).not.toContain("from 'node:crypto'");
			expect(await renderTransformed(tempDir, 'shared-helper', transformedHelper)).toBe('cfunction');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('shares reachability rules across grouped entry boundary plugins', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const islandA = join(tempDir, 'island-a.tsx');
		const islandB = join(tempDir, 'island-b.tsx');
		const sharedHelper = join(tempDir, 'shared-helper.ts');
		writeFileSync(islandA, 'export default 1;\n', 'utf-8');
		writeFileSync(
			islandB,
			[
				"import { read } from './shared-helper';",
				'export default eco.page({',
				'\trender: () => read()',
				'});',
			].join('\n'),
			'utf-8',
		);
		writeFileSync(
			sharedHelper,
			[
				"import { readFileSync } from 'node:fs';",
				'export function read() {',
				"\treturn readFileSync('/secret', 'utf8');",
				'}',
			].join('\n'),
			'utf-8',
		);

		const registrations: OnLoadRegistration[] = [];
		const groupedEntrypointFiles = [islandA, islandB];
		const builder: EcoBuildPluginBuilder = {
			onResolve: () => {},
			onLoad: (options, callback) => registrations.push({ options, callback }),
			module: () => {},
			transform: () => {},
			onEnd: () => {},
			addWatchFile: () => {},
		};

		try {
			for (const plugin of [
				createClientGraphBoundaryPlugin({ entrypointFile: islandA, groupedEntrypointFiles }),
				createClientGraphBoundaryPlugin({ entrypointFile: islandB, groupedEntrypointFiles }),
			]) {
				await plugin.setup(builder);
			}

			const transformEntry = async (filePath: string): Promise<string | undefined> => {
				for (const registration of registrations) {
					if (!registration.options.filter.test(filePath)) continue;
					const result = await registration.callback({ path: filePath });
					if (typeof result?.contents === 'string') return result.contents;
				}
				return undefined;
			};

			await transformEntry(islandB);
			await expect(transformEntry(sharedHelper)).rejects.toThrow("Forbidden client import 'node:fs'");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps per-entry declarations in an app-wide browser build', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const islandA = join(tempDir, 'island-a.tsx');
		const islandB = join(tempDir, 'island-b.tsx');
		const htmlEntry = join(tempDir, 'shell.ts');
		const writeIsland = (filePath: string, serverOnly: string, render: string) =>
			writeFileSync(
				filePath,
				[
					"import { readFileSync, writeFileSync } from 'node:fs';",
					'const eco = { page: (options) => options };',
					`export default eco.page({ middleware: [${serverOnly}], render: () => typeof ${render} });`,
				].join('\n'),
				'utf-8',
			);
		writeIsland(islandA, 'writeFileSync', 'readFileSync');
		writeIsland(islandB, 'readFileSync', 'writeFileSync');
		writeFileSync(htmlEntry, "import fs from 'node:fs';\nexport default String(!!fs);", 'utf-8');

		const registrations: OnLoadRegistration[] = [];
		const entrypoints = { islandA, islandB, htmlEntry };
		const builder: EcoBuildPluginBuilder = {
			entrypoints,
			onResolve: () => {},
			onLoad: (options, callback) => registrations.push({ options, callback }),
			module: () => {},
			transform: () => {},
			onEnd: () => {},
			addWatchFile: () => {},
		};

		try {
			for (const plugin of [
				createClientGraphBoundaryPlugin({
					absWorkingDir: tempDir,
					projectRoot: tempDir,
					entrypointFile: islandA,
					groupedEntrypointFiles: [islandA, islandB],
					groupedDeclaredModules: ['node:fs{readFileSync}', 'node:fs{writeFileSync}'],
					declaredModules: ['node:fs{readFileSync}'],
				}),
				createClientGraphBoundaryPlugin({
					absWorkingDir: tempDir,
					projectRoot: tempDir,
					entrypointFile: islandB,
					groupedEntrypointFiles: [islandA, islandB],
					groupedDeclaredModules: ['node:fs{readFileSync}', 'node:fs{writeFileSync}'],
					declaredModules: ['node:fs{writeFileSync}'],
				}),
			]) {
				await plugin.setup(builder);
			}

			const transformEntry = async (filePath: string): Promise<string | undefined> => {
				for (const registration of registrations) {
					if (!registration.options.filter.test(filePath)) continue;
					const result = await registration.callback({ path: filePath });
					if (typeof result?.contents === 'string') return result.contents;
				}
				return undefined;
			};

			const transformedIslandA = await transformEntry(islandA);
			const transformedIslandB = await transformEntry(islandB);
			expect(transformedIslandA).toContain("import { readFileSync } from 'node:fs';");
			expect(transformedIslandA).not.toContain("writeFileSync } from 'node:fs';");
			expect(transformedIslandB).toContain("import { writeFileSync } from 'node:fs';");
			expect(transformedIslandB).not.toContain("readFileSync, writeFileSync } from 'node:fs';");
			expect(await renderTransformed(tempDir, 'island-a', transformedIslandA!)).toBe('function');
			expect(await renderTransformed(tempDir, 'island-b', transformedIslandB!)).toBe('function');
			expect(await transformEntry(htmlEntry)).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('evaluates a shared island module once across app-wide hydration entries', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const store = join(tempDir, 'cart-store.js');
		const hydrationA = join(tempDir, 'hydration-a.js');
		const hydrationB = join(tempDir, 'hydration-b.js');
		const globalKey = `__ecopages_cart_store_${Math.random().toString(36).slice(2)}`;
		const globalState = globalThis as Record<string, unknown>;
		writeFileSync(join(tempDir, 'package.json'), '{"type":"module"}');
		writeFileSync(
			store,
			`globalThis[${JSON.stringify(globalKey)}] = (globalThis[${JSON.stringify(globalKey)}] ?? 0) + 1; export const cart = {};`,
		);
		writeFileSync(hydrationA, "import { cart } from './cart-store.js'; export { cart };");
		writeFileSync(hydrationB, "import { cart } from './cart-store.js'; export { cart };");

		try {
			const result = await new RolldownBuildAdapter().build({
				environment: 'browser',
				entrypoints: { hydrationA, hydrationB },
				outdir: join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				splitting: true,
			});
			assertBuildSucceeded(result, 'Build failed');
			const hydrationAOutput = getBuildEntryOutput(result, 'hydrationA', tempDir);
			const hydrationBOutput = getBuildEntryOutput(result, 'hydrationB', tempDir);
			expect(hydrationAOutput).toBeDefined();
			expect(hydrationBOutput).toBeDefined();

			await import(pathToFileURL(hydrationAOutput!).href);
			await import(pathToFileURL(hydrationBOutput!).href);

			expect(globalState[globalKey]).toBe(1);
		} finally {
			delete globalState[globalKey];
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('compiles a module that a React island and another Integration share the same way in either entry order', async () => {
		const tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'eco-client-graph-')));
		const island = join(tempDir, 'island.tsx');
		const litEntry = join(tempDir, 'lit-entry.ts');
		writeFileSync(join(tempDir, 'secret.server.ts'), 'export const secret = "server-secret";');
		writeFileSync(
			join(tempDir, 'format.ts'),
			[
				"import { secret } from './secret.server.ts';",
				'export const loadSecret = () => secret;',
				'export const format = (value) => `formatted-${value}`;',
			].join('\n'),
		);
		writeFileSync(island, "import { format } from './format.ts';\nexport default () => format('island');");
		writeFileSync(litEntry, "import { format } from './format.ts';\nconsole.log(format('lit'));");

		const buildInOrder = async (entrypoints: Record<string, string>) => {
			const result = await new RolldownBuildAdapter().build({
				environment: 'browser',
				entrypoints,
				outdir: join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				splitting: true,
				plugins: [
					createClientGraphBoundaryPlugin({
						absWorkingDir: tempDir,
						projectRoot: tempDir,
						entrypointFile: island,
						groupedEntrypointFiles: [island],
					}),
				],
			});
			assertBuildSucceeded(result, 'Build failed');
			return result.outputs
				.filter((output) => output.path.endsWith('.js'))
				.map((output) => readFileSync(output.path, 'utf8'))
				.join('\n');
		};

		try {
			for (const output of [
				await buildInOrder({ island, lit: litEntry }),
				await buildInOrder({ lit: litEntry, island }),
			]) {
				expect(output.match(/formatted-/g)).toHaveLength(1);
				expect(output).not.toContain('server-secret');
			}
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('builds a browser Page after pruning server-only middleware before resolution', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const entrypoint = join(pagesDir, 'entry.ts');
		writeFileSync(join(pagesDir, 'auth.server.ts'), 'export const authMiddleware = "server-secret";');
		writeFileSync(join(pagesDir, 'eco.ts'), 'export const eco = { page: (options) => options };');
		writeFileSync(
			entrypoint,
			[
				"import { eco } from './eco';",
				"import { authMiddleware } from './auth.server.ts';",
				'export default eco.page({',
				'middleware: [authMiddleware],',
				"cache: 'dynamic',",
				"requires: ['session'],",
				'render: () => "Dashboard",',
				'});',
			].join('\n'),
		);

		try {
			const result = await new RolldownBuildAdapter().build({
				environment: 'browser' as const,
				entrypoints: [entrypoint],
				outdir: join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				plugins: [createClientGraphBoundaryPlugin()],
			});
			assertBuildSucceeded(result, 'Build failed');
			const output = readFileSync(result.outputs[0]!.path, 'utf8');
			expect(output).toContain('Dashboard');
			expect(output).not.toContain('server-secret');
			expect(output).not.toContain('authMiddleware');
			expect(output).not.toContain('middleware');
			expect(output).not.toContain('requires');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('strips undeclared node and bare imports while keeping declared modules', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'component.tsx');
		writeFileSync(
			filePath,
			[
				"import fs from 'node:fs';",
				"import { createColumnHelper } from '@tanstack/react-table';",
				"import leftPad from 'left-pad';",
				"const dynamicUndeclared = import('left-pad');",
				"const dynamicDeclared = import('@tanstack/react-table');",
				"const requiredUndeclared = require('left-pad');",
				"const dynamicFs = import('node:fs');",
				"const Component = eco.component({ dependencies: { modules: ['@tanstack/react-table{createColumnHelper}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			/** Forbidden dependencies correctly removed */
			expect(transformed).not.toContain("import fs from 'node:fs'");

			/** Safe UI imports are kept for ESBuild to natively treeshake */
			expect(transformed).toContain("import { createColumnHelper } from '@tanstack/react-table';");
			expect(transformed).toContain("import leftPad from 'left-pad';");

			/** dynamic loads */
			expect(transformed).toContain("const dynamicUndeclared = import('left-pad');");
			expect(transformed).toContain("const dynamicDeclared = import('@tanstack/react-table');");

			/**
			 * True forbidden dependencies (like `node:fs`) dynamically imported are stubbed
			 * to prevent hydration crashes if they are unreachable.
			 */
			expect(transformed).toContain('const dynamicFs = Promise.resolve({});');

			/**
			 * require is strictly matched out if it's node.
			 * The plugin strips requires only if they are forbidden.
			 * `leftPad` is allowed, so it is just left alone!
			 */
			expect(transformed).toContain("const requiredUndeclared = require('left-pad');");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps imports declared via plugin options', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import fs from 'node:fs';",
				"import path from 'node:path';",
				'const eco = { page: (options) => options };',
				"export default eco.page({ middleware: [fs], render: () => path.basename('/a/b') });",
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness({ declaredModules: ['node:path'] });
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("import path from 'node:path';");
			expect(transformed).not.toContain("import fs from 'node:fs';");
			expect(await renderTransformed(tempDir, 'entry', transformed!)).toBe('b');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps relative imports untouched', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');
		writeFileSync(filePath, "import { helper } from './helper';\nexport default helper;\n", 'utf-8');

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps project alias imports untouched', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');
		writeFileSync(
			join(tempDir, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
		);
		writeFileSync(filePath, "import { Counter } from '@/components/counter';\nexport default Counter;\n", 'utf-8');

		try {
			const harness = createPluginTestHarness({ projectRoot: tempDir });
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('surgically removes undeclared named imports when using pkg{named} grammar for forbidden modules', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import { readFileSync, writeFileSync } from 'node:fs';",
				"import { createColumnHelper, useReactTable } from '@tanstack/react-table';",
				"const Component = eco.component({ dependencies: { modules: ['node:fs{readFileSync}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();

			/**
			 * We declared `node:fs{readFileSync}` is allowed.
			 * So `readFileSync` stays, but `writeFileSync` MUST be surgically removed
			 * from the import specifiers since it's a forbidden module that wasn't declared.
			 */
			expect(transformed).toContain("import { readFileSync } from 'node:fs';");
			expect(transformed).not.toContain('writeFileSync');

			/**
			 * `react-table` is completely safe UI code.
			 * Even though it wasn't explicitly declared, we don't prune safe imports.
			 * We let ESBuild safely treeshake `createColumnHelper` and `useReactTable` natively.
			 */
			expect(transformed).toContain("import { createColumnHelper, useReactTable } from '@tanstack/react-table';");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('preserves local aliases and default import syntax when pruning forbidden named specifiers', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import fsDefault, { readFileSync as readText, writeFileSync } from 'node:fs';",
				"const Component = eco.component({ dependencies: { modules: ['node:fs{default,readFileSync}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("import fsDefault, { readFileSync as readText } from 'node:fs';");
			expect(transformed).not.toContain('writeFileSync');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('rewrites default and namespace import combinations into valid syntax after pruning', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import fsDefault, * as fsNs from 'node:fs';",
				"const Component = eco.component({ dependencies: { modules: ['node:fs{*}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("import * as fsNs from 'node:fs';");
			expect(transformed).not.toContain('import { * as fsNs }');
			expect(transformed).not.toContain('fsDefault, * as fsNs');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails when a named barrel re-export makes a server module client-reachable', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const entryPath = join(tempDir, 'entry.tsx');
		const barrelPath = join(tempDir, 'barrel.ts');

		writeFileSync(
			entryPath,
			["import { db } from './barrel';", 'export default eco.page({', '\trender: () => String(db)', '});'].join(
				'\n',
			),
			'utf-8',
		);
		writeFileSync(
			barrelPath,
			["export { db } from './db.server';", "export { Button } from './button';"].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness(
				{ absWorkingDir: tempDir, projectRoot: tempDir },
				{ entry: entryPath },
			);
			await harness.transformFile(entryPath);

			await expect(harness.transformFile(barrelPath)).rejects.toThrow(
				"Forbidden client export from './db.server'",
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('prunes unreachable server-only named re-exports from shared barrels', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const entryPath = join(tempDir, 'entry.tsx');
		const barrelPath = join(tempDir, 'barrel.ts');

		writeFileSync(
			entryPath,
			[
				"import { Button } from './barrel';",
				'export default eco.page({',
				'\trender: () => <Button />',
				'});',
			].join('\n'),
			'utf-8',
		);
		writeFileSync(
			barrelPath,
			["export { Button } from './button';", "export { db } from './db.server';"].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness(
				{ absWorkingDir: tempDir, projectRoot: tempDir },
				{ entry: entryPath },
			);
			await harness.transformFile(entryPath);
			const transformed = await harness.transformFile(barrelPath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("export { Button } from './button';");
			expect(transformed).not.toContain("export { db } from './db.server';");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('strips server-only eco.page options so unreachable middleware imports do not leak into the browser bundle', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import { authMiddleware } from './auth.server';",
				'export default eco.page({',
				"\tcache: 'dynamic',",
				'\tmiddleware: [authMiddleware],',
				"\trequires: ['session'],",
				"\tmetadata: () => ({ title: 'Dashboard' }),",
				'\trender: () => <div>Dashboard</div>,',
				'});',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).not.toContain("import { authMiddleware } from './auth.server';");
			expect(transformed).not.toContain('authMiddleware');
			expect(transformed).not.toContain('cache:');
			expect(transformed).not.toContain('middleware:');
			expect(transformed).not.toContain('requires:');
			expect(transformed).not.toContain('metadata:');
			expect(transformed).toContain('render: () => <div>Dashboard</div>');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('strips staticProps imports from .server helpers before shipping a page entry to the browser', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');

		writeFileSync(
			filePath,
			[
				"import { buildPagesTreeSnapshot } from './tree.server';",
				'export default eco.page({',
				'\tstaticProps: async () => ({ props: await buildPagesTreeSnapshot() }),',
				'\trender: ({ tree }) => <pre>{tree}</pre>,',
				'});',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).not.toContain("import { buildPagesTreeSnapshot } from './tree.server';");
			expect(transformed).not.toContain('buildPagesTreeSnapshot');
			expect(transformed).not.toContain('staticProps:');
			expect(transformed).toContain('render: ({ tree }) => <pre>{tree}</pre>');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps the browser collection loader while stripping server-only Page options', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');

		writeFileSync(
			filePath,
			[
				"import { createLazyCollectionComponents } from '@ecopages/react/lazy-collection-components';",
				"import { loadComponent } from 'ecopages:content/posts/component';",
				"import { getEntryDependencies } from 'ecopages:content/posts/server';",
				'const posts = createLazyCollectionComponents(loadComponent);',
				'export default eco.page({',
				'\tdependencies: async ({ props }) => await getEntryDependencies(props.entry.slug),',
				'\trender: ({ entry }) => { const Content = posts.get(entry.slug); return <Content />; },',
				'});',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toContain("import { loadComponent } from 'ecopages:content/posts/component';");
			expect(transformed).not.toContain('ecopages:content/posts/server');
			expect(transformed).not.toContain('dependencies:');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('rejects a collection server import reachable from render', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');

		writeFileSync(
			filePath,
			[
				"import { getComponent } from 'ecopages:content/posts/server';",
				'export default eco.page({ render: () => getComponent("hello") });',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			await expect(harness.transformFile(filePath)).rejects.toThrow('Forbidden client import');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('removes an import only server-only metadata used', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const pagesDir = join(tempDir, 'pages');
		mkdirSync(pagesDir);
		const filePath = join(pagesDir, 'entry.tsx');

		writeFileSync(
			filePath,
			[
				"import { fileSystem } from '@ecopages/file-system';",
				'export default eco.page({',
				"\tmetadata: async () => ({ title: String((await fileSystem.glob(['**/*.tsx'])).length) }),",
				'\trender: () => <div>Metadata only</div>,',
				'});',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).not.toContain('@ecopages/file-system');
			expect(transformed).not.toContain('metadata:');
			expect(transformed).toContain('render: () => <div>Metadata only</div>');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('client graph boundary: stripped imports', () => {
	const ECO_STUB = 'export const eco = { page: (options) => options, staticProps: (fn) => fn };';

	/**
	 * Builds `entry.tsx` from the given files with the boundary plugin and returns the emitted module path.
	 */
	async function buildBrowserModule(tempDir: string, files: Record<string, string>): Promise<string> {
		writeFileSync(join(tempDir, 'eco.ts'), ECO_STUB);
		for (const [name, contents] of Object.entries(files)) writeFileSync(join(tempDir, name), contents);
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser',
			entrypoints: [join(tempDir, 'entry.tsx')],
			outdir: join(tempDir, 'dist'),
			root: tempDir,
			target: 'browser',
			format: 'esm',
			plugins: [createClientGraphBoundaryPlugin()],
		});
		assertBuildSucceeded(result, 'Build failed');
		return result.outputs[0]!.path;
	}

	async function evaluate(outputPath: string): Promise<Record<string, unknown>> {
		return (await import(pathToFileURL(outputPath).href)) as Record<string, unknown>;
	}

	it('removes a hoisted staticProps helper that uses a server import', () =>
		withTempDir(async (tempDir) => {
			const outputPath = await buildBrowserModule(tempDir, {
				'posts.server.ts': 'export const getPost = async () => "server-secret";',
				'entry.tsx': [
					"import { eco } from './eco';",
					"import { getPost } from './posts.server';",
					'const staticProps = async () => ({ props: { post: await getPost() } });',
					'export default eco.page({ staticProps, render: () => "Post" });',
				].join('\n'),
			});
			const output = readFileSync(outputPath, 'utf8');
			expect(output).not.toContain('getPost');
			expect(output).not.toContain('server-secret');
			const page = (await evaluate(outputPath)).default as { render: () => string; staticProps?: unknown };
			expect(page.render()).toBe('Post');
			expect(page.staticProps).toBeUndefined();
		}));

	it('drops a helper export that needs a node built-in when the Page renders another export', () =>
		withTempDir(async (tempDir) => {
			const outputPath = await buildBrowserModule(tempDir, {
				'mixed-utils.ts': [
					"import { readFileSync } from 'node:fs';",
					'export function formatDate(date: Date) { return date.toISOString().slice(0, 4); }',
					"export function dbSecretQuery() { return readFileSync('/etc/passwd', 'utf8'); }",
				].join('\n'),
				'entry.tsx': [
					"import { eco } from './eco';",
					"import { formatDate, dbSecretQuery } from './mixed-utils';",
					'export default eco.page({ render: () => formatDate(new Date(Date.UTC(2026, 0, 1))) });',
				].join('\n'),
			});
			const output = readFileSync(outputPath, 'utf8');
			expect(output).not.toContain('readFileSync');
			expect(output).not.toContain('/etc/passwd');
			expect(((await evaluate(outputPath)).default as { render: () => string }).render()).toBe('2026');
		}));

	it('treats destructured bindings and class member names as local', () =>
		withTempDir(async (tempDir) => {
			const outputPath = await buildBrowserModule(tempDir, {
				'db.server.ts': 'export const db = "server-secret";',
				'entry.tsx': [
					"import { eco } from './eco';",
					"import { db } from './db.server';",
					'export const read = ({ db }: { db: string }) => db;',
					'export const pick = (source: { db: string }) => { const { db } = source; return db; };',
					'export const first = ([db]: string[]) => db;',
					'export class Repo { db() { return "method"; } static db = "field"; }',
					'export const shape = { db: 1 }.db;',
					'export default eco.page({ middleware: [db], render: () => "Page" });',
				].join('\n'),
			});
			const module = await evaluate(outputPath);
			expect((module.read as (value: { db: string }) => string)({ db: 'a' })).toBe('a');
			expect((module.pick as (value: { db: string }) => string)({ db: 'b' })).toBe('b');
			expect((module.first as (value: string[]) => string)(['c'])).toBe('c');
			expect(new (module.Repo as new () => { db: () => string })().db()).toBe('method');
			expect(module.shape).toBe(1);
		}));

	it.each([
		['an as expression', 'export const guard = authMiddleware as unknown;', 2, 22],
		['a satisfies expression', 'export const guard = [authMiddleware] satisfies unknown[];', 2, 23],
		['a JSX element name', 'export const guard = () => <authMiddleware.Provider />;', 2, 29],
		[
			'a name shadowed elsewhere in the module',
			'export const guard = authMiddleware;\nconst wrap = (authMiddleware: unknown) => authMiddleware;',
			2,
			22,
		],
	])('fails the build when a stripped import is used in %s', (_case, usage, line, column) =>
		withTempDir(async (tempDir) => {
			await expect(
				buildBrowserModule(tempDir, {
					'auth.server.ts': 'export const authMiddleware = "server-secret";',
					'entry.tsx': [
						"import { authMiddleware } from './auth.server';",
						usage,
						'export default { render: () => "Page", guard };',
					].join('\n'),
				}),
			).rejects.toThrow(
				`'authMiddleware' (imported from './auth.server') is used at ${join(tempDir, 'entry.tsx')}:${line}:${column}`,
			);
		}),
	);

	it('fails the build when a JSX component imported from a server module is rendered outside render', () =>
		withTempDir(async (tempDir) => {
			await expect(
				buildBrowserModule(tempDir, {
					'secret.server.tsx': 'export const Secret = () => "server-secret";',
					'entry.tsx': [
						"import { Secret } from './secret.server';",
						'export const Widget = () => <Secret />;',
						'export default { render: () => "Page", Widget };',
					].join('\n'),
				}),
			).rejects.toThrow(
				`'Secret' (imported from './secret.server') is used at ${join(tempDir, 'entry.tsx')}:2:30`,
			);
		}));

	it('removes a node built-in used only by a server-only Page option', () =>
		withTempDir(async (tempDir) => {
			const outputPath = await buildBrowserModule(tempDir, {
				'entry.tsx': [
					"import { eco } from './eco';",
					"import fs from 'node:fs';",
					'const title = fs.existsSync("title.txt") ? "file" : "default";',
					'export default eco.page({ metadata: () => ({ title }), render: () => "Page" });',
				].join('\n'),
			});
			expect(readFileSync(outputPath, 'utf8')).not.toContain('existsSync');
			expect(((await evaluate(outputPath)).default as { render: () => string }).render()).toBe('Page');
		}));

	it('fails the build when a stripped node built-in is still used', () =>
		withTempDir(async (tempDir) => {
			await expect(
				buildBrowserModule(tempDir, {
					'entry.tsx': ["import fs from 'node:fs';", 'export default String(!!fs);'].join('\n'),
				}),
			).rejects.toThrow(`'fs' (imported from 'node:fs') is used at ${join(tempDir, 'entry.tsx')}:2:25`);
		}));

	it('removes a content collection server import used only by staticPaths', () =>
		withTempDir(async (tempDir) => {
			const outputPath = await buildBrowserModule(tempDir, {
				'entry.tsx': [
					"import { eco } from './eco';",
					"import { entries } from 'ecopages:content/posts/server';",
					'const paths = entries.map((entry) => ({ params: { slug: entry.slug } }));',
					'export default eco.page({ staticPaths: async () => ({ paths }), render: () => "Post" });',
				].join('\n'),
			});
			expect(((await evaluate(outputPath)).default as { render: () => string }).render()).toBe('Post');
		}));

	it('fails the build when a content collection server import is still used', () =>
		withTempDir(async (tempDir) => {
			await expect(
				buildBrowserModule(tempDir, {
					'entry.tsx': [
						"import { entries } from 'ecopages:content/posts/server';",
						'export const count = entries.length;',
						'export default { render: () => "Post", count };',
					].join('\n'),
				}),
			).rejects.toThrow(
				`'entries' (imported from 'ecopages:content/posts/server') is used at ${join(tempDir, 'entry.tsx')}:2:22`,
			);
		}));
});

describe('client graph boundary: one plan per build', () => {
	/**
	 * Builds two React islands that share `shared.ts`, holding back the load of `delayed` until `shared.ts`
	 * starts loading, so the other island's requests reach `shared.ts` first.
	 */
	async function buildWithLoadOrder(tempDir: string, delayed: 'island-a' | 'island-b') {
		const islandA = join(tempDir, 'island-a.tsx');
		const islandB = join(tempDir, 'island-b.tsx');
		const sharedLoading = Promise.withResolvers<void>();
		const loadOrder: EcoBuildPlugin = {
			name: 'load-order',
			setup(build) {
				build.onLoad({ filter: /shared\.ts$/ }, () => {
					sharedLoading.resolve();
					return undefined;
				});
				build.onLoad({ filter: new RegExp(`${delayed}\\.tsx$`) }, async () => {
					await sharedLoading.promise;
					return undefined;
				});
			},
		};
		const groupedEntrypointFiles = [islandA, islandB];
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser',
			entrypoints: { islandA, islandB },
			outdir: join(tempDir, 'dist'),
			root: tempDir,
			target: 'browser',
			format: 'esm',
			splitting: true,
			writeToDisk: false,
			plugins: [
				loadOrder,
				...groupedEntrypointFiles.map((entrypointFile) =>
					createClientGraphBoundaryPlugin({
						absWorkingDir: tempDir,
						projectRoot: tempDir,
						entrypointFile,
						groupedEntrypointFiles,
					}),
				),
			],
		});
		if (!result.success) return { error: result.logs.map((log) => log.message).join('\n') };
		return {
			outputs: result.outputs
				.map((output) => [output.path, String(output.content)])
				.sort(([left], [right]) => left!.localeCompare(right!)),
		};
	}

	function writeIslands(tempDir: string, shared: string[]) {
		writeFileSync(join(tempDir, 'secret.server.ts'), 'export const secret = "server-secret";');
		writeFileSync(join(tempDir, 'shared.ts'), shared.join('\n'));
		writeFileSync(join(tempDir, 'island-a.tsx'), "import { a } from './shared';\nexport default () => a();");
		writeFileSync(join(tempDir, 'island-b.tsx'), "import { b } from './shared';\nexport default () => b();");
	}

	it('prunes a shared module to byte-identical output in either load order', () =>
		withTempDir(async (tempDir) => {
			writeIslands(tempDir, [
				"import { secret } from './secret.server';",
				"export const a = () => 'from-a';",
				"export const b = () => 'from-b';",
				'export const leak = () => secret;',
			]);

			const first = await buildWithLoadOrder(tempDir, 'island-b');
			const second = await buildWithLoadOrder(tempDir, 'island-a');

			expect(first.error).toBeUndefined();
			expect(second).toEqual(first);
			const code = first.outputs!.map(([, content]) => content).join('\n');
			expect(code).toContain('from-a');
			expect(code).toContain('from-b');
			expect(code).not.toContain('server-secret');
		}));

	it('rejects an export another island needs from a server module in either load order', () =>
		withTempDir(async (tempDir) => {
			writeIslands(tempDir, [
				"import { secret } from './secret.server';",
				"export const a = () => 'from-a';",
				'export const b = () => secret;',
			]);

			const first = await buildWithLoadOrder(tempDir, 'island-b');
			const second = await buildWithLoadOrder(tempDir, 'island-a');

			expect(first.error).toContain("Forbidden client import './secret.server'");
			expect(second).toEqual(first);
		}));

	it('registers one handler for every boundary instance of a build', async () => {
		const registrations: OnLoadRegistration[] = [];
		const builder: EcoBuildPluginBuilder = {
			entrypoints: { a: '/app/a.tsx', b: '/app/b.tsx' },
			onResolve: () => {},
			onLoad: (options, callback) => registrations.push({ options, callback }),
			module: () => {},
			transform: () => {},
			onEnd: () => {},
			addWatchFile: () => {},
		};
		for (const entrypointFile of ['/app/a.tsx', '/app/b.tsx']) {
			await createClientGraphBoundaryPlugin({
				absWorkingDir: '/app',
				entrypointFile,
				groupedEntrypointFiles: ['/app/a.tsx', '/app/b.tsx'],
			}).setup(builder);
		}

		expect(registrations).toHaveLength(1);
		expect(registrations[0]!.options.exclude?.test('/app/node_modules/react/index.js')).toBe(true);
	});

	it('declares a file it inlines as a dependency of the entries that hold the module', () =>
		withTempDir(async (tempDir) => {
			const entrypoint = join(tempDir, 'entry.tsx');
			const greeting = join(tempDir, 'greeting.txt');
			writeFileSync(greeting, 'hello');
			writeFileSync(
				join(tempDir, 'copy.ts'),
				"export const copy = fs.readFileSync(path.resolve('greeting.txt'), 'utf8');",
			);
			writeFileSync(entrypoint, "import { copy } from './copy';\nexport default () => copy;");

			const result = await new RolldownBuildAdapter().build({
				environment: 'browser',
				entrypoints: [entrypoint],
				outdir: join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				writeToDisk: false,
				plugins: [createClientGraphBoundaryPlugin({ absWorkingDir: tempDir, projectRoot: tempDir })],
			});

			assertBuildSucceeded(result, 'Build failed');
			expect(String(result.outputs[0]!.content)).toContain('hello');
			expect(result.dependencyGraph.entrypoints[entrypoint]).toContain(greeting);
		}));
});
