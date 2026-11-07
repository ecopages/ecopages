/**
 * The contract every stylesheet Processor meets, as cases a test runner can run.
 * @module @ecopages/core/processor/contract
 */

import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { collectBuildEntryInputPaths } from './build/build-graph.ts';
import { createServerBuildRequest } from './build/runtime/build-request-policy.ts';
import { finalizeEcoPagesConfig } from './config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig, IClientBridge } from './config/internal-types.ts';
import { DevelopmentStylesheetService } from './dev/stylesheets/development-stylesheet.service.ts';
import type { AnyProcessor } from './plugins/processor.ts';
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

async function createContractApp(processor: AnyProcessor | undefined): Promise<ContractApp> {
	const rootDir = fileSystem.realpath(fileSystem.mkdtemp(path.join(path.fromNative(tmpdir()), 'eco-css-contract-')));
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
			processors: processor ? [processor] : [],
		});
		processor?.setContext(config);
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

/** A bridge that records the stylesheets it refreshed and the errors it showed. */
function createRecordingBridge(): { bridge: IClientBridge; refreshed: string[]; errors: string[] } {
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

async function withApp(processor: AnyProcessor | undefined, run: (app: ContractApp) => Promise<void>): Promise<void> {
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
 * - a transform that throws fails the build;
 * - in development, a transform that throws keeps the last good output, and the save that fixes it recovers without
 *   a restart;
 * - with no Processor, plain CSS reaches the importer as written.
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
		{
			name: 'the stylesheets a transform reads drive rebuilds',
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					const partial = app.write('src/styles/base.css', '.base { color: red; }\n');
					const main = app.write('src/styles/main.css', "@import './base.css' layer(base);\n");
					const entry = app.write(
						'src/styles/main.script.ts',
						"import styles from './main.css';\nexport default styles;\n",
					);

					const result = await buildServerEntry(app, entry);
					assert.ok(result.success, 'the server build failed');
					assert.ok(
						collectBuildEntryInputPaths(result, entry, app.rootDir).includes(partial),
						'the server module of a script that imports main.css does not list the partial main.css imports',
					);

					const stylesheets = new DevelopmentStylesheetService(app.config);
					await stylesheets.prewarm();
					const { bridge, refreshed } = createRecordingBridge();
					app.write('src/styles/base.css', '.base { color: blue; }\n');
					assert.deepEqual(
						await stylesheets.applyChanges(changed(partial), bridge),
						[main],
						'an edit to the partial does not rebuild main.css in development',
					);
					assert.deepEqual(refreshed, [main], 'an edit to the partial does not refresh only main.css');
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
			run: () =>
				withApp(subject.createProcessor(), async (app) => {
					const goodCss = '.card { color: red; }\n';
					const card = app.write('src/card.css', goodCss);
					const stylesheets = new DevelopmentStylesheetService(app.config);
					await stylesheets.prewarm();
					const lastGood = stylesheets.version(card);
					const { bridge, refreshed, errors } = createRecordingBridge();

					app.write('src/card.css', invalidCss);
					await stylesheets.applyChanges(changed(card), bridge);
					assert.equal(errors.length, 1, 'a failed rebuild does not show its error');
					assert.deepEqual(refreshed, [], 'a failed rebuild refreshes the stylesheet');
					assert.equal(stylesheets.version(card), lastGood, 'a failed rebuild drops the last good output');

					app.write('src/card.css', goodCss);
					assert.deepEqual(
						await stylesheets.applyChanges(changed(card), bridge),
						[card],
						'the save that fixes the stylesheet does not recover it',
					);
					assert.deepEqual(refreshed, [card], 'the save that fixes the stylesheet does not refresh it');
				}),
		},
		{
			name: 'with no Processor, plain CSS passes through unchanged',
			run: () =>
				withApp(undefined, async (app) => {
					const css = ".card { color: red; }\n@import './other.css';\n";
					app.write('src/card.css', css);
					const entry = app.write(
						'src/card.script.ts',
						"import styles from './card.css';\nexport { styles };\n",
					);

					const result = await buildServerEntry(app, entry);
					assert.ok(result.success, 'the server build failed');
					const output = result.outputs.map((file) => file.content ?? '').join('\n');
					assert.ok(
						output.includes(JSON.stringify(css)),
						'the module of a plain stylesheet is not its source',
					);
				}),
		},
	];
}
