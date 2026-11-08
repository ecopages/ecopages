import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { Processor, type ProcessorConfig, type StylesheetTransformResult } from '../../plugins/processor.ts';

const IMPORT = /@import\s+['"](\.[^'"]+)['"]\s*(?:layer\((\w+)\))?\s*;/gu;

/** The config of an {@link InliningProcessor} whose `stylesheet` capability matches `.css`. */
export const INLINING_PROCESSOR_CONFIG: ProcessorConfig = {
	name: 'inlining',
	capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
};

/** Drops every marked instance of an inlined stylesheet but the last, then the markers. */
function keepLastInstances(css: string): string {
	let kept = css;
	for (const file of new Set([...css.matchAll(/\/\*start:(.+?)\*\//gu)].map((match) => match[1]!))) {
		const start = `/*start:${file}*/`;
		const end = `/*end:${file}*/`;
		let from = kept.indexOf(start);
		while (from !== kept.lastIndexOf(start)) {
			kept = `${kept.slice(0, from)}${kept.slice(kept.indexOf(end, from) + end.length)}`;
			from = kept.indexOf(start);
		}
	}
	return kept.replace(/\/\*(?:start|end):.+?\*\//gu, '');
}

/**
 * The part of a CSS bundler core relies on: it inlines relative `@import`s, nested ones included, wraps one with
 * `layer(name)` in `@layer name`, reports every inlined file as a dependency, and rejects an unclosed block in the
 * inlined result, so a partial may open a block its importer closes. A stylesheet imported more than once keeps its
 * last instance, as Lightning CSS and the cascade order it.
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
				const wrapped = layer ? `@layer ${layer} {\n${contents}}\n` : contents;
				return `/*start:${imported}*/${wrapped}/*end:${imported}*/`;
			});
		const inlined = keepLastInstances(inline(css, file));
		if (inlined.split('{').length !== inlined.split('}').length) throw new Error(`${file}: Unclosed block`);
		return { css: inlined, dependencies };
	}
}
