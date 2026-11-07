import { path } from '@ecopages/file-system/path';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { findStylesheetProcessor, getStylesheetKinds } from '../../../../plugins/stylesheet-kinds.ts';

/** A processed stylesheet and the other stylesheets its transform read. */
export interface ProcessedStylesheet {
	css: string;
	/** Absolute paths, without duplicates or the stylesheet itself. */
	dependencies: string[];
}

/**
 * Runs the registered stylesheet Processor over `content`, or returns it as written when none applies.
 *
 * @remarks
 * An app has at most one stylesheet Processor (config finalization rejects a second), so there is no chain: a
 * stylesheet reaches that Processor only when it is a `.css` file or has an extension the Processor declares,
 * the Processor's capability filter matches it, and it implements `transformStylesheet`.
 *
 * Only the dependencies that are stylesheets are kept. A Processor that scans content, such as Tailwind, also reports
 * every file it scanned; a change to one reaches the stylesheet through the Processor instead, so a content edit does
 * not invalidate every Page and module that uses the stylesheet.
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

	const result = await processor.transformStylesheet(content, filepath);
	const self = path.resolve(filepath);
	const dependencies = new Set(
		(result.dependencies ?? [])
			.map((dependency) => path.resolve(dependency))
			.filter((dependency) => dependency !== self && kinds.isStylesheet(dependency)),
	);
	return { css: result.css, dependencies: [...dependencies] };
}
