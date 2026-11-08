import { path } from '@ecopages/file-system/path';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import {
	CSS_MODULE_PROCESSOR_FIX,
	findStylesheetProcessor,
	getStylesheetKinds,
} from '../../../../plugins/stylesheet-kinds.ts';
import { inlineStylesheetImports } from './app-stylesheet-imports.ts';
import type { ProcessedStylesheet } from './processed-stylesheet-cache.ts';

export type { ProcessedStylesheet } from './processed-stylesheet-cache.ts';

/**
 * Runs the registered stylesheet Processor over `content`, or returns it as written when none applies.
 *
 * @remarks
 * An app has at most one stylesheet Processor (config finalization rejects a second), so there is no chain: a
 * stylesheet reaches that Processor only when it is a `.css` file or has an extension the Processor declares,
 * the Processor's capability filter matches it, and it implements `transformStylesheet`.
 *
 * Only the dependencies that are stylesheets are kept. A Processor that scans content, such as Tailwind, also reports
 * every file it scanned; a change to one reaches the stylesheet through the Processor's `invalidateStylesheets` hook
 * instead, so a content edit does not invalidate every Page and module that uses the stylesheet.
 *
 * A CSS Module (see `StylesheetKinds.isCssModule`) needs a Processor that declares `cssModules`, and the result then
 * carries the `exports` the Processor returned: the class map, from the same transform as the scoped CSS. Without
 * one the call rejects, so no environment can serve a CSS Module unscoped.
 *
 * After the Processor, the relative `@import`s it left are inlined (see {@link inlineStylesheetImports}), so plain CSS
 * with no Processor works in a build. The partials count as dependencies, like those the Processor reports.
 *
 * The result goes through the app's processed stylesheet cache, so one edit runs the Processor once whichever path
 * asks first (see `ProcessedStylesheetCache`). A config with no app runtime, as in a unit test, transforms each time.
 */
export async function applyStylesheetProcessors(
	appConfig: EcoPagesAppConfig,
	content: string,
	filepath: string,
): Promise<ProcessedStylesheet> {
	const kinds = getStylesheetKinds(appConfig);
	if (!kinds.isStylesheet(filepath)) {
		return { css: content, dependencies: [] };
	}

	const processor = findStylesheetProcessor(appConfig.processors?.values() ?? []);
	const transformStylesheet =
		processor?.transformStylesheet && processor.canProcessAsset('stylesheet', filepath)
			? processor.transformStylesheet.bind(processor)
			: undefined;
	const isCssModule = kinds.isCssModule(filepath);
	if (isCssModule && (!kinds.scopesCssModules || !transformStylesheet)) {
		throw new Error(`[ecopages] ${filepath} is a CSS Module. ${CSS_MODULE_PROCESSOR_FIX}`);
	}

	if (!transformStylesheet && !/@import/i.test(content)) {
		return { css: content, dependencies: [] };
	}

	const self = path.resolve(filepath);
	const process = async (): Promise<ProcessedStylesheet> => {
		const transformed = transformStylesheet ? await transformStylesheet(content, filepath) : { css: content };
		if (isCssModule && !transformed.exports) {
			throw new Error(
				`[ecopages] ${filepath} is a CSS Module, but Processor "${processor?.name}" returned no exports for it.`,
			);
		}
		const inlined = inlineStylesheetImports(transformed.css, filepath);
		const dependencies = new Set(
			[...(transformed.dependencies ?? []), ...inlined.dependencies]
				.map((dependency) => path.resolve(dependency))
				.filter((dependency) => dependency !== self && kinds.isStylesheet(dependency)),
		);
		return {
			css: inlined.css,
			dependencies: [...dependencies],
			...(isCssModule ? { exports: transformed.exports } : {}),
		};
	};
	const cache = appConfig.appRuntime?.processedStylesheets;
	return cache ? cache.get(filepath, content, process) : process();
}
