/**
 * The contract every stylesheet Processor meets, as cases a test runner can run.
 * @module @ecopages/core/processor/contract
 */

import assert from 'node:assert/strict';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { applyStylesheetProcessors } from './assets/asset-processing-service/processors/stylesheet/stylesheet-processor-pipeline.ts';
import {
	compileStylesheetModule,
	toClassMapModule,
} from './assets/asset-processing-service/processors/stylesheet/stylesheet-module.ts';
import { collectBuildEntryInputPaths } from './build/build-graph.ts';
import { createServerBuildRequest } from './build/runtime/build-request-policy.ts';
import { AssetProcessingService } from './assets/asset-processing-service/asset-processing.service.ts';
import { HmrManager } from './adapters/shared/hmr/hmr-manager.ts';
import { setNodeEnvironment } from './env.ts';
import { finalizeEcoPagesConfig } from './config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig, IClientBridge } from './config/internal-types.ts';
import { getDevelopmentStylesheetService } from './dev/stylesheets/development-stylesheet.service.ts';
import { DevelopmentStylesheetService } from './dev/stylesheets/development-stylesheet.service.ts';
import type { AnyProcessor } from './plugins/processor.ts';
import type { ClientBridgeEvent } from './types/contracts.ts';
import { requireAppRuntime } from './utils/app-runtime.ts';

/** The stylesheet Processor a contract run checks. */
export interface StylesheetProcessorContractSubject {
	/**
	 * Creates a fresh Processor whose `stylesheet` capability matches `.css` files.
	 *
	 * @remarks
	 * It must inline a relative `@import`, including one with a `layer()`, as `postcss-import` and Lightning CSS
	 * bundling do.
	 */
	createProcessor(): AnyProcessor;
	/** A stylesheet the Processor rejects; defaults to an unclosed block. */
	invalidCss?: string;
	/**
	 * Whether the Processor declares `cssModules`, which adds the cases that check its scoping.
	 *
	 * @remarks
	 * `createProcessor` must then return a Processor whose `stylesheet` capability scopes `*.module.css` files: each
	 * class of `.name` gets a scoped name, and `exports` maps `name` to it.
	 */
	cssModules?: boolean;
}

/** One check of the contract: `run` rejects when the Processor breaks it. */
export interface StylesheetProcessorContractCase {
	name: string;
	run(): Promise<void>;
}

/** An app in a temporary folder, removed by `dispose`. */
interface ContractApp {
	config: EcoPagesAppConfig;
	rootDir: string;
	write(relativePath: string, contents: string): string;
	dispose(): void;
}

async function createContractApp(processor: AnyProcessor): Promise<ContractApp> {
	const rootDir = fileSystem.realpath(fileSystem.mkdtemp(path.join(fileSystem.tempDir(), 'eco-css-contract-')));
	const write = (relativePath: string, contents: string) => {
		const file = path.join(rootDir, relativePath);
		fileSystem.write(file, contents);
		return file;
	};
	write('src/.keep', '');
	try {
		const config = await finalizeEcoPagesConfig({
			rootDir,
			integrations: [],
			processors: [processor],
		});
		processor.setContext(config);
		return { config, rootDir, write, dispose: () => fileSystem.remove(rootDir) };
	} catch (error) {
		fileSystem.remove(rootDir);
		throw error;
	}
}

/** Builds `entry` for the server and returns the files its module closure read. */
async function buildServerEntry(app: ContractApp, entry: string) {
	return requireAppRuntime(app.config).buildAdapter.build(
		createServerBuildRequest(app.config, {
			entrypoints: [entry],
			outdir: path.join(app.rootDir, 'out'),
			root: app.rootDir,
			writeToDisk: false,
		}),
	);
}

export { DevelopmentStylesheetService };
export type { IClientBridge };

/**
 * A client bridge that records the stylesheets it refreshed and the errors it showed, to hand to a
 * {@link DevelopmentStylesheetService} in a Processor's own development tests.
 */
export function createRecordingBridge(): { bridge: IClientBridge; refreshed: string[]; errors: string[] } {
	const refreshed: string[] = [];
	const errors: string[] = [];
	const bridge: IClientBridge = {
		subscriberCount: 1,
		broadcast: () => {},
		reload: () => {},
		update: () => {},
		cssUpdate: (file) => refreshed.push(file),
		error: (message) => errors.push(message),
	};
	return { bridge, refreshed, errors };
}

const changed = (file: string) => ({ created: [], changed: [file], deleted: [] });

async function withApp(processor: AnyProcessor, run: (app: ContractApp) => Promise<void>): Promise<void> {
	const app = await createContractApp(processor);
	try {
		await run(app);
	} finally {
		app.dispose();
	}
}

/**
 * The cases a stylesheet Processor must pass, to run under any test runner.
 *
 * @remarks
 * Each case builds a temporary app with the Processor from `subject` and checks what core does with its output:
 * - the files a transform reports reading drive rebuilds, of the server modules that embed the stylesheet and of the
 *   stylesheet in development;
 * - a stylesheet imported twice keeps its last instance, the one the cascade orders by;
 * - a transform that throws fails the build;
 * - in development, a transform that throws keeps the last good output, and the save that fixes it recovers without
 *   a restart;
 * - in development, a Page request for a stylesheet that throws still renders: it links the last good output, or no
 *   stylesheet when none compiled, and the error shows in the browser; a build fails instead.
 *
 * @example
 * ```ts
 * for (const contractCase of stylesheetProcessorContract({ createProcessor: () => myProcessor() })) {
 * 	it(contractCase.name, contractCase.run);
 * }
 * ```
 */
export function stylesheetProcessorContract(
	subject: StylesheetProcessorContractSubject,
): StylesheetProcessorContractCase[] {
	const invalidCss = subject.invalidCss ?? '.broken {\n';
	return [
		...(subject.cssModules ? cssModuleCases(subject) : []),
		{
			name: 'the stylesheets a transform reads drive rebuilds',
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					const partial = app.write('src/styles/base.css', "@import './deep.css';\n.base { color: red; }\n");
					const deep = app.write('src/styles/deep.css', '.deep { color: red; }\n');
					const main = app.write('src/styles/main.css', "@import './base.css' layer(base);\n");
					const entry = app.write(
						'src/styles/main.script.ts',
						"import styles from './main.css';\nexport default styles;\n",
					);

					const result = await buildServerEntry(app, entry);
					assert.ok(result.success, 'the server build failed');
					const inputs = collectBuildEntryInputPaths(result, entry, app.rootDir);
					assert.ok(
						inputs.includes(partial) && inputs.includes(deep),
						'the server module of a script that imports main.css does not list the partials main.css inlines',
					);

					const stylesheets = new DevelopmentStylesheetService(app.config);
					await stylesheets.prewarm();
					const { bridge, refreshed } = createRecordingBridge();
					app.write('src/styles/deep.css', '.deep { color: blue; }\n');
					assert.ok(
						(await stylesheets.applyChanges(changed(deep), bridge)).includes(main),
						'an edit to a nested partial does not rebuild main.css in development',
					);
					assert.ok(refreshed.includes(main), 'an edit to a nested partial does not refresh main.css');
					assert.ok(!refreshed.includes(partial), 'an edit to a nested partial rebuilds the partial between');
				}),
		},
		{
			name: 'a stylesheet imported twice keeps its last instance',
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					app.write('src/styles/shared.css', '.shared-rule { color: red; }\n');
					app.write('src/styles/other.css', '.other-rule { color: blue; }\n');
					app.write(
						'src/styles/main.css',
						"@import './shared.css';\n@import './other.css';\n@import './shared.css';\n",
					);
					const entry = app.write(
						'src/styles/main.script.ts',
						"import styles from './main.css';\nexport default styles;\n",
					);

					const result = await buildServerEntry(app, entry);
					assert.ok(result.success, 'the server build failed');
					const css = result.success ? result.outputs.map((output) => output.content ?? '').join('\n') : '';
					assert.ok(
						css.indexOf('.other-rule') !== -1 && css.indexOf('.other-rule') < css.indexOf('.shared-rule'),
						'a stylesheet imported twice is not ordered by its last import, as the cascade orders it',
					);
				}),
		},
		{
			name: 'a transform that throws fails the build',
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					app.write('src/card.css', invalidCss);
					const entry = app.write(
						'src/card.script.ts',
						"import styles from './card.css';\nexport default styles;\n",
					);

					const result = await buildServerEntry(app, entry);
					assert.equal(
						result.success,
						false,
						'the server build succeeded with a stylesheet the Processor rejects',
					);
				}),
		},
		{
			name: 'in development, a transform that throws keeps the last good output until a save fixes it',
			run: () => breakAndFix(subject, 'src/card.css'),
		},
		...pageRequestCases(subject, 'src/card.css'),
	];
}

/**
 * Requests the stylesheet at `file` as a Page render does, through the asset service of an app whose NODE_ENV is
 * `environment`, and returns what the request answered, the errors the browser was sent, and a `save` that
 * rewrites the stylesheet as the watcher sees it.
 */
async function pageRequest(subject: StylesheetProcessorContractSubject, file: string, environment: string) {
	const restoreEnvironment = setNodeEnvironment(environment);
	const app = await createContractApp(subject.createProcessor());
	const broadcasts: ClientBridgeEvent[] = [];
	const manager = new HmrManager({
		appConfig: app.config,
		bridge: {
			subscriberCount: 1,
			broadcast: (event) => broadcasts.push(event),
			reload: () => {},
			update: () => {},
			cssUpdate: () => {},
			error: () => {},
		},
	});
	const service = AssetProcessingService.createWithDefaultProcessors(app.config);
	const stylesheet = path.join(app.rootDir, file);
	return {
		app,
		broadcasts,
		stylesheet,
		request: () =>
			service.processDependencies(
				[{ kind: 'stylesheet', source: 'file', filepath: stylesheet, inline: false }],
				undefined,
			),
		save: async (css: string) => {
			app.write(file, css);
			requireAppRuntime(app.config).buildInputIndex.recordChanges([stylesheet]);
			await manager.handleFileChanges([stylesheet]);
		},
		finish: () => {
			manager.stop();
			app.dispose();
			restoreEnvironment();
		},
	};
}

/**
 * A server build, which a Page request runs for the modules it renders, of a module that imports the stylesheet
 * with a binding: in development it compiles the import to the last good CSS, and a production build fails.
 */
function serverBuildCase(subject: StylesheetProcessorContractSubject, file: string): StylesheetProcessorContractCase {
	const invalidCss = subject.invalidCss ?? '.broken {\n';
	const goodCss = '.card { color: red; }\n';
	const build = async (environment: string, expectation: (success: boolean, css: string) => void) => {
		const page = await pageRequest(subject, file, environment);
		try {
			const card = page.app.write(file, goodCss);
			const entry = page.app.write(
				'src/card.script.ts',
				`import styles from './${path.basename(file)}';\nexport default styles;\n`,
			);
			await getDevelopmentStylesheetService(page.app.config).prewarm();
			await page.save(invalidCss);
			await getDevelopmentStylesheetService(page.app.config).applyChanges(
				changed(card),
				createRecordingBridge().bridge,
			);
			const result = await buildServerEntry(page.app, entry);
			expectation(
				result.success,
				result.success ? result.outputs.map((output) => output.content ?? '').join('\n') : '',
			);
		} finally {
			page.finish();
		}
	};
	return {
		name: 'in development, a server build compiles a broken stylesheet import to its last good CSS, and a production build fails',
		run: async () => {
			await build('development', (success, code) => {
				assert.ok(success, 'a broken stylesheet fails the server build in development');
				assert.ok(/\.card\b/u.test(code) && !code.includes('.broken'), 'the last good CSS is not in the build');
			});
			await build('production', (success) =>
				assert.equal(success, false, 'a production build serves a broken stylesheet'),
			);
		},
	};
}

function pageRequestCases(
	subject: StylesheetProcessorContractSubject,
	file: string,
): StylesheetProcessorContractCase[] {
	const invalidCss = subject.invalidCss ?? '.broken {\n';
	const goodCss = '.card { color: red; }\n';
	const shownErrors = (broadcasts: ClientBridgeEvent[]) => broadcasts.filter((event) => event.type === 'error');
	return [
		{
			name: 'in development, a Page request links the last good output while the stylesheet is broken, and a save recovers it',
			run: async () => {
				const page = await pageRequest(subject, file, 'development');
				try {
					page.app.write(file, goodCss);
					const [good] = await page.request();
					assert.ok(good?.filepath, 'the first Page request does not link the stylesheet');
					const goodBytes = fileSystem.readFileSync(good.filepath).toString();

					await page.save(invalidCss);
					const [kept] = await page.request();
					assert.equal(
						kept?.filepath,
						good.filepath,
						'a broken stylesheet is not served as its last good output',
					);
					assert.equal(fileSystem.readFileSync(kept.filepath!).toString(), goodBytes);
					assert.equal(shownErrors(page.broadcasts).length, 1, 'the Page request does not show the error');

					await page.save('.card { color: blue; }\n');
					const [fixed] = await page.request();
					assert.notEqual(
						fileSystem.readFileSync(fixed.filepath!).toString(),
						goodBytes,
						'the fixed stylesheet is not served',
					);
				} finally {
					page.finish();
				}
			},
		},
		{
			name: 'in development, a Page request renders without a stylesheet that never compiled, and shows the error',
			run: async () => {
				const page = await pageRequest(subject, file, 'development');
				try {
					page.app.write(file, invalidCss);
					assert.deepEqual(await page.request(), [], 'a stylesheet that never compiled is linked');
					assert.equal(shownErrors(page.broadcasts).length, 1, 'the Page request does not show the error');
				} finally {
					page.finish();
				}
			},
		},
		...(file.includes('.module.') ? [] : [serverBuildCase(subject, file)]),
		{
			name: 'during a production build, a Page request fails on a stylesheet that throws',
			run: async () => {
				const page = await pageRequest(subject, file, 'production');
				try {
					requireAppRuntime(page.app.config).staticGenerationActive = true;
					page.app.write(file, invalidCss);
					await assert.rejects(page.request());
					assert.deepEqual(shownErrors(page.broadcasts), []);
				} finally {
					page.finish();
				}
			},
		},
	];
}

/**
 * Breaks the stylesheet at `file` in development, checks that its last good output stays and the error shows, then fixes it
 * and checks that it recovers.
 */
function breakAndFix(subject: StylesheetProcessorContractSubject, file: string): Promise<void> {
	const invalidCss = subject.invalidCss ?? '.broken {\n';
	return withApp(subject.createProcessor(), async (app) => {
		const goodCss = '.card { color: red; }\n';
		const card = app.write(file, goodCss);
		const stylesheets = new DevelopmentStylesheetService(app.config);
		await stylesheets.prewarm();
		const lastGood = stylesheets.version(card);
		const { bridge, refreshed, errors } = createRecordingBridge();

		app.write(file, invalidCss);
		await stylesheets.applyChanges(changed(card), bridge);
		assert.equal(errors.length, 1, 'a failed rebuild does not show its error');
		assert.deepEqual(refreshed, [], 'a failed rebuild refreshes the stylesheet');
		assert.equal(stylesheets.version(card), lastGood, 'a failed rebuild drops the last good output');

		app.write(file, goodCss);
		assert.deepEqual(
			await stylesheets.applyChanges(changed(card), bridge),
			[card],
			'the save that fixes the stylesheet does not recover it',
		);
		assert.deepEqual(refreshed, [card], 'the save that fixes the stylesheet does not refresh it');
	});
}

const MODULE_CSS = '.primary { color: red; }\n.secondary { color: blue; }\n';

/** Processes the CSS Module `src/button.module.css` of a fresh app, written with `css`. */
async function scopeButton(subject: StylesheetProcessorContractSubject, css: string) {
	const processor = subject.createProcessor();
	const app = await createContractApp(processor);
	try {
		const file = app.write('src/button.module.css', css);
		return await applyStylesheetProcessors(app.config, css, file);
	} finally {
		app.dispose();
	}
}

function cssModuleCases(subject: StylesheetProcessorContractSubject): StylesheetProcessorContractCase[] {
	return [
		{
			name: 'a CSS Module returns the scoped CSS and the class map that names it',
			run: async () => {
				const { css, exports } = await scopeButton(subject, MODULE_CSS);
				assert.ok(exports, 'a CSS Module returned no exports');
				assert.deepEqual(Object.keys(exports).sort(), ['primary', 'secondary']);
				for (const [local, scoped] of Object.entries(exports)) {
					assert.ok(scoped.split(' ')[0]!.includes(local), `the scoped name of ${local} does not keep it`);
					assert.ok(css.includes(`.${scoped.split(' ')[0]}`), `the CSS does not define the scoped ${local}`);
					assert.ok(!new RegExp(`\\.${local}\\b`).test(css), `the CSS still defines the unscoped ${local}`);
				}
			},
		},
		{
			name: 'the scoped names are the same in two folders',
			run: async () => {
				const first = await scopeButton(subject, MODULE_CSS);
				const second = await scopeButton(subject, MODULE_CSS);
				assert.deepEqual(second.exports, first.exports, 'the class map depends on the app folder');
				assert.equal(second.css, first.css, 'the scoped CSS depends on the app folder');
			},
		},
		{
			name: 'a CSS Module of a package scopes by package name and path, in any folder and store layout',
			run: async () => {
				const scopePackage = async (packageDir: string) => {
					const processor = subject.createProcessor();
					const app = await createContractApp(processor);
					try {
						app.write(path.join(packageDir, 'package.json'), '{"name":"ui-kit","version":"1.0.0"}');
						const file = app.write(path.join(packageDir, 'dist/button.module.css'), MODULE_CSS);
						return await applyStylesheetProcessors(app.config, MODULE_CSS, fileSystem.realpath(file));
					} finally {
						app.dispose();
					}
				};
				const hoisted = await scopePackage('node_modules/ui-kit');
				const store = await scopePackage('node_modules/.pnpm/ui-kit@1.0.0/node_modules/ui-kit');
				assert.ok(hoisted.exports, 'a package CSS Module returned no exports');
				assert.deepEqual(store.exports, hoisted.exports, 'the class map depends on the store layout');
				assert.equal(store.css, hoisted.css, 'the scoped CSS depends on the store layout');
			},
		},
		{
			name: 'the module a CSS Module compiles to holds the class map, not the CSS',
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					const file = app.write('src/button.module.css', MODULE_CSS);
					const { exports } = await applyStylesheetProcessors(app.config, MODULE_CSS, file);

					const { code } = await compileStylesheetModule(app.config, file);
					assert.equal(code, toClassMapModule(exports ?? {}));
					assert.ok(!code.includes('color'), 'the module embeds the CSS of the CSS Module');
				}),
		},
		{
			name: 'a CSS Module that the Processor rejects does not compile',
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					const file = app.write('src/button.module.css', subject.invalidCss ?? '.broken {\n');
					await assert.rejects(compileStylesheetModule(app.config, file));
				}),
		},
		{
			name: 'in development, a CSS Module that throws keeps the last good output until a save fixes it',
			run: () => breakAndFix(subject, 'src/card.module.css'),
		},
		...pageRequestCases(subject, 'src/card.module.css'),
	];
}
