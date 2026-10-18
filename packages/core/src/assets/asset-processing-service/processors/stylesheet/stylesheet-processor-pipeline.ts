import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';

const PROCESSABLE_STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

function isProcessableStylesheet(filepath: string): boolean {
	return PROCESSABLE_STYLESHEET_EXTENSIONS.has(path.extname(filepath));
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
		if (!processor.transformStylesheet || !processor.canProcessAsset('stylesheet', filepath)) {
			continue;
		}

		transformedContent = await processor.transformStylesheet(transformedContent, filepath);
	}

	return transformedContent;
}
