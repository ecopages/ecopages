import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { getStylesheetKinds } from '../../../../plugins/stylesheet-kinds.ts';

export async function applyStylesheetProcessors(
	appConfig: EcoPagesAppConfig,
	content: string,
	filepath: string,
): Promise<string> {
	if (!getStylesheetKinds(appConfig).isStylesheet(filepath)) {
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
