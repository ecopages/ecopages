import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EcoImage } from '@ecopages/image-processor/component/html';
import { getDocsKit } from '../config';

/** MDX components available in body-only content files without per-page imports. */
export function getDocsMdxComponents(): Record<string, unknown> {
	return {
		...getDocsKit().mdxComponents,
		EcoImage,
	};
}

export function getEcopagesImagesVirtualModuleUrl(): string {
	const { rootDir } = getDocsKit();
	return pathToFileURL(join(rootDir, 'dist/cache/ecopages-image-processor/virtual-module.ts')).href;
}

/**
 * Image exports from the image-processor virtual module for `{...imageExport}` spreads in MDX.
 */
export async function loadDocsMdxImageExports(): Promise<Record<string, unknown>> {
	const { strictImageImports } = getDocsKit();

	try {
		return (await import('ecopages:images')) as Record<string, unknown>;
	} catch (primaryError) {
		try {
			return (await import(getEcopagesImagesVirtualModuleUrl())) as Record<string, unknown>;
		} catch (secondaryError) {
			if (strictImageImports) {
				const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
				throw new Error(`Failed to load ecopages image exports: ${message}`, {
					cause: secondaryError,
				});
			}

			return {};
		}
	}
}
