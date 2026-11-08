import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { InliningProcessor } from '../../../../__fixtures__/stylesheets/inlining-processor.ts';
import { ScopingProcessor } from '../../../../__fixtures__/stylesheets/scoping-processor.ts';
import {
	CSS_MODULE_TYPES_MODULE,
	removeCssModuleDeclaration,
	writeCssModuleDeclaration,
	writeCssModuleDeclarations,
} from './css-module-types.ts';

let rootDir: string;

beforeEach(() => {
	rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'css-module-types-')));
});

afterEach(() => {
	fs.rmSync(rootDir, { recursive: true, force: true });
});

function write(relativePath: string, contents: string): string {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
	return file;
}

async function createConfig(processor = new ScopingProcessor()): Promise<EcoPagesAppConfig> {
	const config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
	processor.setContext(config);
	return config;
}

const declarationOf = (relativeToSrc: string) =>
	path.join(rootDir, 'node_modules/@types', CSS_MODULE_TYPES_MODULE, `${relativeToSrc}.d.ts`);

/** The messages of the errors `tsc` reports for the app, as an app's `tsconfig.json` would configure it. */
function typeErrors(): string[] {
	const options = ts.parseJsonConfigFileContent(
		{
			compilerOptions: {
				strict: true,
				noEmit: true,
				module: 'esnext',
				moduleResolution: 'bundler',
				rootDirs: ['./src', `./node_modules/@types/${CSS_MODULE_TYPES_MODULE}`],
				paths: { '@/*': ['./src/*', `./node_modules/@types/${CSS_MODULE_TYPES_MODULE}/*`] },
			},
			include: ['src'],
		},
		ts.sys,
		rootDir,
	);
	// An app declares the default export of every CSS Module in the ambient declaration core ships.
	const ambient = path.join(rootDir, 'src/ambient.d.ts');
	const program = ts.createProgram({ rootNames: [...options.fileNames, ambient], options: options.options });
	return ts
		.getPreEmitDiagnostics(program)
		.map(
			(diagnostic) =>
				`${path.basename(diagnostic.file?.fileName ?? '')}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
		);
}

describe('CSS Module declarations', () => {
	it('types the named exports and the default map of a CSS Module, and rejects an unknown name', async () => {
		write(
			'src/ambient.d.ts',
			fs.readFileSync(
				path.join(path.dirname(path.fromFileUrl(import.meta.url)), '../../../../css-imports.d.ts'),
				'utf8',
			),
		);
		write(
			'src/button.module.css',
			'.primary { color: red; }\n.is-active { color: blue; }\n.styles { color: green; }\n',
		);
		write(
			'src/page.ts',
			[
				`import { primary, styles as stylesClass } from './button.module.css';`,
				`import styles from './button.module.css';`,
				`import { primary as aliased } from '@/button.module.css';`,
				`export const names: string[] = [primary, aliased, styles.primary, styles['is-active'], stylesClass];`,
			].join('\n'),
		);
		write('src/unknown-named.ts', `import { secondary } from './button.module.css';\nexport { secondary };\n`);
		write(
			'src/unknown-key.ts',
			`import styles from './button.module.css';\nexport const missing = styles.secondary;\n`,
		);
		await writeCssModuleDeclarations(await createConfig());

		expect(typeErrors().sort()).toEqual([
			expect.stringMatching(/^unknown-key\.ts: Property 'secondary' does not exist/u),
			expect.stringMatching(/^unknown-named\.ts: Module .* has no exported member 'secondary'/u),
		]);
	});

	it('writes nothing when no Processor scopes CSS Modules', async () => {
		write('src/button.module.css', '.primary { color: red; }\n');
		const config = await createConfig(new InliningProcessor());

		await writeCssModuleDeclarations(config);

		expect(fs.existsSync(path.join(rootDir, 'node_modules/@types', CSS_MODULE_TYPES_MODULE))).toBe(false);
	});

	it('drops the declaration of a CSS Module that no longer exists', async () => {
		const config = await createConfig();
		const file = write('src/components/card.module.css', '.card { color: red; }\n');
		writeCssModuleDeclaration(config, file, { card: 'x_card' });
		expect(fs.existsSync(declarationOf('components/card.module.css'))).toBe(true);

		removeCssModuleDeclaration(config, file);

		expect(fs.existsSync(declarationOf('components/card.module.css'))).toBe(false);
	});

	it('replaces the declarations of an earlier run with the ones for the CSS Modules now in the app', async () => {
		write('src/old.module.css', '.old { color: red; }\n');
		const config = await createConfig();
		await writeCssModuleDeclarations(config);
		fs.rmSync(path.join(rootDir, 'src/old.module.css'));
		write('src/new.module.css', '.fresh { color: red; }\n');

		await writeCssModuleDeclarations(config);

		expect(fs.existsSync(declarationOf('old.module.css'))).toBe(false);
		expect(fs.readFileSync(declarationOf('new.module.css'), 'utf8')).toContain('"fresh"');
	});
});
