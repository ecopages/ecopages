import { describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { Processor, type StylesheetTransformResult } from './plugins/processor.ts';
import { stylesheetProcessorContract } from './processor-contract.ts';

const IMPORT = /@import\s+['"](\.[^'"]+)['"]\s*(?:layer\((\w+)\))?\s*;/gu;

/**
 * Inlines relative `@import`s, wrapping one with `layer(name)` in `@layer name`, and rejects an unclosed block: the
 * part of a CSS bundler the contract relies on.
 */
class InliningProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string, file: string): Promise<StylesheetTransformResult> {
		if (css.split('{').length !== css.split('}').length) throw new Error(`${file}: Unclosed block`);
		const dependencies: string[] = [];
		const inlined = css.replace(IMPORT, (_statement, specifier: string, layer: string | undefined) => {
			const imported = path.resolve(path.dirname(file), specifier);
			dependencies.push(imported);
			const contents = fileSystem.readFileSync(imported);
			return layer ? `@layer ${layer} {\n${contents}}\n` : contents;
		});
		return { css: inlined, dependencies };
	}
}

describe('stylesheet Processor contract, for a fixture Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () =>
			new InliningProcessor({ name: 'inlining', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] }),
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});
