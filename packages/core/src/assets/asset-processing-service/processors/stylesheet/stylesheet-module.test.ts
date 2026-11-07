import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { Processor } from '../../../../plugins/processor.ts';
import { compileStylesheetModule } from './stylesheet-module.ts';

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
