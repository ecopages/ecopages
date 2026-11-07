import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { findStylesheetProcessor, getStylesheetKinds } from '../../../../plugins/stylesheet-kinds.ts';

/**
 * Runs the registered stylesheet Processor over `content`, or returns it as written when none applies.
 *
 * @remarks
 * An app has at most one stylesheet Processor (config finalization rejects a second), so there is no chain: a
 * stylesheet reaches that Processor only when it is a `.css` file or has an extension the Processor declares,
 * the Processor's capability filter matches it, and it implements `transformStylesheet`.
 */
export async function applyStylesheetProcessors(
	appConfig: EcoPagesAppConfig,
	content: string,
	filepath: string,
): Promise<string> {
	if (!getStylesheetKinds(appConfig).isStylesheet(filepath)) {
		return content;
	}

	const processor = findStylesheetProcessor(appConfig.processors?.values() ?? []);
	if (!processor?.transformStylesheet || !processor.canProcessAsset('stylesheet', filepath)) {
		return content;
	}

	return processor.transformStylesheet(content, filepath);
}
