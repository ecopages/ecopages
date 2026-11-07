import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import type { Processor, ProcessorExtensionPattern } from '../plugins/processor.ts';

const CSS_EXTENSION = '.css';
const CSS_MODULE_INFIX = '.module';

/**
 * Answers which files are stylesheets and which of those are CSS Modules.
 *
 * @remarks
 * A stylesheet is a `.css` file, plus a file with an extension the registered stylesheet Processor declares.
 * Core names no other extension, so an app without a stylesheet Processor handles plain CSS only.
 */
export interface StylesheetKinds {
	/** The lowercase, dotted stylesheet extensions, `.css` first. */
	readonly extensions: readonly string[];
	/** Whether `file`, a path or an import specifier, names a stylesheet. */
	isStylesheet(file: string): boolean;
	/** Whether `file` names a CSS Module: `.module.css`, or `.module.<ext>` for a declared extension. */
	isCssModule(file: string): boolean;
}

/**
 * Concrete dotted extensions a Processor extension pattern names.
 *
 * @remarks
 * Handles `.css`, `css`, `*.css` and `*.{css,scss}`. The bare `*` wildcard and patterns that are not an
 * extension name none, so a Processor cannot turn every file into a stylesheet.
 */
function extensionsOfPattern(pattern: ProcessorExtensionPattern): string[] {
	const normalized = pattern.trim().toLowerCase();
	const grouped = /^\*\.\{(.+)\}$/.exec(normalized);
	const items = grouped ? grouped[1]!.split(',') : [normalized.replace(/^\*/, '')];
	return items
		.map((item) => item.trim().replace(/^\./, ''))
		.filter((item) => item !== '' && !/[*{},/]/.test(item))
		.map((item) => `.${item}`);
}

/**
 * Finds the one Processor that declares a `stylesheet` capability.
 *
 * @throws When two Processors declare one, naming both.
 */
export function findStylesheetProcessor(processors: Iterable<Processor>): Processor | undefined {
	let found: Processor | undefined;
	for (const processor of processors) {
		if (!processor.canProcessAsset('stylesheet')) continue;
		if (found) {
			throw new Error(
				`Only one Processor may declare a stylesheet capability, but "${found.name}" and "${processor.name}" both do.`,
			);
		}
		found = processor;
	}
	return found;
}

/**
 * Builds the {@link StylesheetKinds} for the stylesheet Processor among `processors`, or for plain CSS alone.
 *
 * @throws When two Processors declare a `stylesheet` capability.
 */
export function createStylesheetKinds(processors: Iterable<Processor> = []): StylesheetKinds {
	const declared = findStylesheetProcessor(processors)
		?.getAssetCapabilities()
		.filter((capability) => capability.kind === 'stylesheet')
		.flatMap((capability) => (capability.extensions ?? []).flatMap(extensionsOfPattern));
	const extensions = [...new Set([CSS_EXTENSION, ...(declared ?? [])])];
	const moduleSuffixes = extensions.map((extension) => `${CSS_MODULE_INFIX}${extension}`);
	const endsWithAny = (file: string, suffixes: readonly string[]) => {
		const lower = file.toLowerCase();
		return suffixes.some((suffix) => lower.endsWith(suffix));
	};
	return {
		extensions,
		isStylesheet: (file) => endsWithAny(file, extensions),
		isCssModule: (file) => endsWithAny(file, moduleSuffixes),
	};
}

/** The kinds of an app with no stylesheet Processor. */
export const PLAIN_CSS_KINDS: StylesheetKinds = createStylesheetKinds();

/** The {@link StylesheetKinds} of the Processors registered on `appConfig`. */
export function getStylesheetKinds(appConfig: Pick<EcoPagesAppConfig, 'processors'>): StylesheetKinds {
	return createStylesheetKinds(appConfig.processors?.values() ?? []);
}
