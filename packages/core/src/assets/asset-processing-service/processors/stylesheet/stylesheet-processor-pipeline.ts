import { path } from '@ecopages/file-system/path';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { findStylesheetProcessor, getStylesheetKinds } from '../../../../plugins/stylesheet-kinds.ts';
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
	if (!processor?.transformStylesheet || !processor.canProcessAsset('stylesheet', filepath)) {
		return { css: content, dependencies: [] };
	}

	const transformStylesheet = processor.transformStylesheet.bind(processor);
	const transform = async (): Promise<ProcessedStylesheet> => {
		const result = await transformStylesheet(content, filepath);
		const self = path.resolve(filepath);
		const dependencies = new Set(
			(result.dependencies ?? [])
				.map((dependency) => path.resolve(dependency))
				.filter((dependency) => dependency !== self && kinds.isStylesheet(dependency)),
		);
		return { css: result.css, dependencies: [...dependencies] };
	};
	const cache = appConfig.appRuntime?.processedStylesheets;
	return cache ? cache.get(filepath, content, transform) : transform();
}
