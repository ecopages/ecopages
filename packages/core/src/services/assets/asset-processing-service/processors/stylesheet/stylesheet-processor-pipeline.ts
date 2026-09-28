import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types.ts';
import type { Processor } from '../../../../../plugins/processor.ts';

const PROCESSABLE_STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

function isProcessableStylesheet(filepath: string): boolean {
	return PROCESSABLE_STYLESHEET_EXTENSIONS.has(path.extname(filepath));
}

/**
 * Legacy fallback for processors that transform stylesheets without declaring
 * capabilities (notably PostCSS before capability metadata was required).
 */
function shouldRunStylesheetProcessor(processor: Processor, filepath: string): boolean {
	const hasCapabilities = processor.getAssetCapabilities().length > 0;
	const canProcessStylesheet = processor.canProcessAsset('stylesheet', filepath);

	if (canProcessStylesheet) {
		return true;
	}

	if (hasCapabilities) {
		return false;
	}

	return processor.getName().includes('postcss');
}

export async function applyStylesheetProcessors(
	appConfig: EcoPagesAppConfig,
	content: string,
	filepath: string,
): Promise<string> {
	if (!isProcessableStylesheet(filepath)) {
		return content;
	}

	let transformedContent = content;
	const processors = appConfig.processors ? Array.from(appConfig.processors.values()) : [];

	for (const processor of processors) {
		if (!shouldRunStylesheetProcessor(processor, filepath)) {
			continue;
		}

		if (!processor.matchesFileFilter(filepath)) {
			continue;
		}

		const result = await processor.process(transformedContent, filepath);

		if (typeof result === 'string') {
			transformedContent = result;
			continue;
		}

		if (result instanceof Buffer) {
			transformedContent = result.toString();
		}
	}

	return transformedContent;
}
