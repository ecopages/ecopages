import { path } from '@ecopages/file-system/path';
import { toPackageScopeFile } from '../../utils/package-path.ts';
import { contentHash } from '../../utils/content-hash.ts';
import type { ProcessorConfig, StylesheetTransformResult } from '../../plugins/processor.ts';
import { InliningProcessor } from './inlining-processor.ts';

/** The config of a {@link ScopingProcessor}: an inlining Processor whose `stylesheet` capability scopes CSS Modules. */
export const SCOPING_PROCESSOR_CONFIG: ProcessorConfig = {
	name: 'scoping',
	capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
};

const CLASS_SELECTOR = /\.([_a-zA-Z][\w-]*)/gu;

/**
 * The part of a CSS Modules engine core relies on: a `*.module.css` stylesheet has each class renamed to
 * `<hash of its path relative to the app root, by package name and path for a package file>_<name>` and returns that rename as `exports`, and any other
 * stylesheet is only inlined, as {@link InliningProcessor} does.
 */
export class ScopingProcessor extends InliningProcessor {
	constructor(config: ProcessorConfig = SCOPING_PROCESSOR_CONFIG) {
		super(config);
	}

	override async transformStylesheet(css: string, file: string): Promise<StylesheetTransformResult> {
		const inlined = await super.transformStylesheet(css, file);
		if (!/\.module\.css$/iu.test(file)) return inlined;
		const rootDir = this.context?.rootDir ?? '';
		const prefix = `c${contentHash(path.relative(rootDir, toPackageScopeFile(file, rootDir) ?? file), 8)}`;
		const exports: Record<string, string> = {};
		const scoped = inlined.css.replace(CLASS_SELECTOR, (_selector, name: string) => {
			exports[name] = `${prefix}_${name}`;
			return `.${exports[name]}`;
		});
		return { ...inlined, css: scoped, exports };
	}
}
