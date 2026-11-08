import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupAppRuntimePlugins } from '../build/build-adapter.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { DECLARING_PROCESSOR_CONFIG, DeclaringProcessor } from '../__fixtures__/stylesheets/declaring-processor.ts';
import { serializeStylesheetModuleDeclarations } from './processor.ts';

let rootDir: string;

beforeEach(() => {
	rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'stylesheet-module-declarations-')));
});

afterEach(() => {
	fs.rmSync(rootDir, { recursive: true, force: true });
});

function write(relativePath: string, contents: string): void {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
}

/** Sets the app up, as `ecopages types` does, so each Processor runs its `setup()`. */
async function setUp(processor: DeclaringProcessor): Promise<void> {
	const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
	await setupAppRuntimePlugins({ appConfig });
}

/** The errors `tsc` reports for `src`, with no declaration of the app's own: only the generated `@types` packages. */
function typeErrors(): string[] {
	const options = ts.parseJsonConfigFileContent(
		{
			compilerOptions: { strict: true, noEmit: true, module: 'esnext', moduleResolution: 'bundler' },
			include: ['src'],
		},
		ts.sys,
		rootDir,
	);
	const program = ts.createProgram({ rootNames: options.fileNames, options: options.options });
	return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
		const file = path.basename(diagnostic.file?.fileName ?? '');
		return `${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
	});
}

describe('a stylesheet Processor that declares extensions beyond .css', () => {
	it.fails(
		'types the import of each declared extension once it has set up, with no declaration in the app',
		async () => {
			write('src/card.scss', '.card { color: red; }\n');
			write('src/card.module.scss', '.card { color: red; }\n');
			write(
				'src/page.ts',
				[
					`import styles from './card.scss';`,
					`import classes from './card.module.scss';`,
					`export const css: string = styles;`,
					`export const name: string = classes.card;`,
				].join('\n'),
			);
			write('src/wrong.ts', `import styles from './card.scss';\nexport const css: number = styles;\n`);
			await setUp(new DeclaringProcessor());

			expect(typeErrors()).toEqual([
				expect.stringMatching(/^wrong\.ts: Type 'string' is not assignable to type 'number'/u),
			]);
		},
	);

	it('writes nothing for a Processor that declares only .css', async () => {
		await setUp(
			new DeclaringProcessor({
				...DECLARING_PROCESSOR_CONFIG,
				capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
			}),
		);

		expect(fs.existsSync(path.join(rootDir, 'node_modules/@types'))).toBe(false);
	});
});

describe('serializeStylesheetModuleDeclarations', () => {
	it.fails('declares the plain and the module pattern of each extension, the module pattern first', () => {
		const text = serializeStylesheetModuleDeclarations([
			{ kind: 'stylesheet', extensions: ['*.{scss, SASS}', '.css'], cssModules: true },
			{ kind: 'image', extensions: ['*.png'] },
		]);

		expect(text.match(/declare module '[^']+'/gu)).toEqual([
			`declare module '*.module.scss'`,
			`declare module '*.scss'`,
			`declare module '*.module.sass'`,
			`declare module '*.sass'`,
		]);
	});

	it('declares nothing for .css alone, a Processor with no stylesheet capability, or none', () => {
		expect(
			serializeStylesheetModuleDeclarations([{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }]),
		).toBe('');
		expect(serializeStylesheetModuleDeclarations([{ kind: 'image', extensions: ['*.scss'] }])).toBe('');
		expect(serializeStylesheetModuleDeclarations([])).toBe('');
	});
});
