import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { ImageSpecifications } from './types.ts';
import { anyCaseToCamelCase } from './utils.ts';

export type ImageMap = Record<string, ImageSpecifications>;

export type ImageProcessorDiskConfig = {
	sourceDir: string;
	outputDir: string;
	acceptedFormats?: string[];
};

/**
 * Parses export bindings from the generated image virtual-module source file.
 */
export function parseVirtualModuleExports(content: string): Record<string, ImageSpecifications> | null {
	const exports: Record<string, ImageSpecifications> = {};
	const pattern = /export const (\w+) = ([\s\S]*?) as const;/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(content)) !== null) {
		try {
			exports[match[1]] = JSON.parse(match[2]) as ImageSpecifications;
		} catch {
			return null;
		}
	}

	return exports;
}

export async function getSourceImagePaths(resolvedConfig: ImageProcessorDiskConfig): Promise<string[]> {
	const acceptedFormats = resolvedConfig.acceptedFormats ?? ['jpg', 'jpeg', 'png', 'webp'];
	return fileSystem.glob([`${resolvedConfig.sourceDir}/**/*.{${acceptedFormats.join(',')}}`]);
}

function getGeneratedOutputPath(outputDir: string, src: string): string {
	return path.join(outputDir, path.basename(src));
}

/**
 * Restores processed image state from generated dist artifacts when every source
 * image has a matching virtual-module export and output files on disk.
 */
export async function loadProcessedImagesFromDisk(options: {
	resolvedConfig: ImageProcessorDiskConfig;
	runtimeVirtualModulePath: string;
}): Promise<ImageMap | null> {
	const sourceImages = await getSourceImagePaths(options.resolvedConfig);

	if (sourceImages.length === 0) {
		return {};
	}

	if (!fileSystem.exists(options.runtimeVirtualModulePath)) {
		return null;
	}

	const exportsByName = parseVirtualModuleExports(fileSystem.readFileSync(options.runtimeVirtualModulePath));
	if (!exportsByName) {
		return null;
	}

	const imageMap: ImageMap = {};

	for (const file of sourceImages) {
		const basename = path.basename(file);
		const exportName = anyCaseToCamelCase(basename);
		const spec = exportsByName[exportName];

		if (!spec) {
			return null;
		}

		const outputPaths = [spec.attributes.src, ...spec.variants.map((variant) => variant.src)];
		if (
			!outputPaths.every((src) =>
				fileSystem.exists(getGeneratedOutputPath(options.resolvedConfig.outputDir, src)),
			)
		) {
			return null;
		}

		imageMap[basename] = spec;
	}

	return imageMap;
}
