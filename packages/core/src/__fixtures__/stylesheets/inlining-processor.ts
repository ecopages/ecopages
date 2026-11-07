import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { Processor, type ProcessorConfig, type StylesheetTransformResult } from '../../plugins/processor.ts';

const IMPORT = /@import\s+['"](\.[^'"]+)['"]\s*(?:layer\((\w+)\))?\s*;/gu;

/** The config of an {@link InliningProcessor} whose `stylesheet` capability matches `.css`. */
export const INLINING_PROCESSOR_CONFIG: ProcessorConfig = {
	name: 'inlining',
	capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
};

/**
 * The part of a CSS bundler core relies on: it inlines relative `@import`s, nested ones included, wraps one with
 * `layer(name)` in `@layer name`, reports every inlined file as a dependency, and rejects an unclosed block in the
 * inlined result, so a partial may open a block its importer closes.
 */
export class InliningProcessor extends Processor {
	constructor(config: ProcessorConfig = INLINING_PROCESSOR_CONFIG) {
		super(config);
	}

	async setup(): Promise<void> {}

	override async transformStylesheet(css: string, file: string): Promise<StylesheetTransformResult> {
		const dependencies: string[] = [];
		const inline = (source: string, from: string): string =>
			source.replace(IMPORT, (_statement, specifier: string, layer: string | undefined) => {
				const imported = path.resolve(path.dirname(from), specifier);
				dependencies.push(imported);
				const contents = inline(fileSystem.readFileSync(imported), imported);
				return layer ? `@layer ${layer} {\n${contents}}\n` : contents;
			});
		const inlined = inline(css, file);
		if (inlined.split('{').length !== inlined.split('}').length) throw new Error(`${file}: Unclosed block`);
		return { css: inlined, dependencies };
	}
}
