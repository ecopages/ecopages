import { describe, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { Processor } from './plugins/processor.ts';
import { stylesheetProcessorContract } from './processor-contract.ts';

const IMPORT = /@import\s+['"](\.[^'"]+)['"]\s*(?:layer\((\w+)\))?\s*;/gu;

/**
 * Inlines relative `@import`s, wrapping one with `layer(name)` in `@layer name`, and rejects an unclosed block: the
 * part of a CSS bundler the contract relies on.
 */
class InliningProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string, file: string): Promise<string> {
		if (css.split('{').length !== css.split('}').length) throw new Error(`${file}: Unclosed block`);
		return css.replace(IMPORT, (_statement, specifier: string, layer: string | undefined) => {
			const contents = fileSystem.readFileSync(path.resolve(path.dirname(file), specifier));
			return layer ? `@layer ${layer} {\n${contents}}\n` : contents;
		});
	}
}

describe('stylesheet Processor contract, for a fixture Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () =>
			new InliningProcessor({ name: 'inlining', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] }),
	});
	for (const contractCase of cases) {
		const runCase = contractCase.name === 'the stylesheets a transform reads drive rebuilds' ? it.fails : it;
		runCase(contractCase.name, contractCase.run);
	}
});
