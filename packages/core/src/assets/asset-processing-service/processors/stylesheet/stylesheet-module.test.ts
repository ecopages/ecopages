import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { Processor } from '../../../../plugins/processor.ts';
import { compileStylesheetModule } from './stylesheet-module.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

class FixtureStylesheetProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string): Promise<{ css: string }> {
		if (css.includes('broken')) throw new Error('Unclosed block');
		return { css: css.replace('@apply text-red;', 'color: red;') };
	}
}

function configWith(processor?: Processor): Promise<EcoPagesAppConfig> {
	return finalizeEcoPagesConfig({ rootDir: dir, integrations: [], processors: processor ? [processor] : [] });
}

const stylesheetProcessor = () =>
	new FixtureStylesheetProcessor({ name: 'fixture', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] });

let dir: string;

beforeEach(() => {
	dir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'stylesheet-module-')));
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

function writeStylesheet(css: string): string {
	const file = path.join(dir, 'card.css');
	fs.writeFileSync(file, css);
	return file;
}

describe('compileStylesheetModule', () => {
	it('default-exports the CSS the stylesheet Processor produced', async () => {
		const file = writeStylesheet('.card { @apply text-red; }');

		expect(await compileStylesheetModule(await configWith(stylesheetProcessor()), file)).toEqual({
			code: 'export default ".card { color: red; }";\n',
			dependencies: [],
		});
	});

	it('default-exports the CSS as written when no stylesheet Processor is registered', async () => {
		const file = writeStylesheet('.card { @apply text-red; }');

		expect(await compileStylesheetModule(await configWith(), file)).toEqual({
			code: 'export default ".card { @apply text-red; }";\n',
			dependencies: [],
		});
	});

	it('rejects with the error the stylesheet Processor throws', async () => {
		const file = writeStylesheet('.card { broken');

		await expect(compileStylesheetModule(await configWith(stylesheetProcessor()), file)).rejects.toThrow(
			'Unclosed block',
		);
	});
});

describe('compileStylesheetModule, for a CSS Module', () => {
	class ScopingFixture extends Processor {
		transforms = 0;
		async setup(): Promise<void> {}
		override async transformStylesheet(css: string) {
			this.transforms += 1;
			return { css: css.replace('.card', '.x_card'), exports: { card: 'x_card' } };
		}
	}
	const scopingProcessor = () =>
		new ScopingFixture({
			name: 'scoping',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
		});
	const writeModule = (css: string): string => {
		const file = path.join(dir, 'card.module.css');
		fs.writeFileSync(file, css);
		return file;
	};

	it('default-exports the class map and not the CSS', async () => {
		const file = writeModule('.card { color: red; }');

		expect(await compileStylesheetModule(await configWith(scopingProcessor()), file)).toEqual({
			code: 'export default {"card":"x_card"};\n',
			dependencies: [],
		});
	});

	it('runs the Processor once for the class map and the CSS the Page links', async () => {
		const processor = scopingProcessor();
		const config = await configWith(processor);
		const file = writeModule('.card { color: red; }');

		await compileStylesheetModule(config, file);
		const delivered = await applyStylesheetProcessors(config, fs.readFileSync(file, 'utf8'), file);

		expect(delivered.css).toBe('.x_card { color: red; }');
		expect(processor.transforms).toBe(1);
	});

	it('rejects, naming the package to install, when no Processor scopes CSS Modules', async () => {
		const file = writeModule('.card { color: red; }');

		await expect(compileStylesheetModule(await configWith(stylesheetProcessor()), file)).rejects.toThrow(
			'@ecopages/lightningcss-processor',
		);
		await expect(compileStylesheetModule(await configWith(), file)).rejects.toThrow('is a CSS Module');
	});
});
