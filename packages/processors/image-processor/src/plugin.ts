/**
 * ImageProcessorPlugin
 * @module @ecopages/image-processor
 */

import path from 'node:path';
import { deepMerge, FileUtils } from '@ecopages/core';
import { resolveGeneratedPath } from '@ecopages/core/constants';
import { Processor, type ProcessorConfig, type ProcessorWatchConfig } from '@ecopages/core/plugins/processor';
import type { AssetDefinition } from '@ecopages/core/services/asset-processing-service';
import { Logger } from '@ecopages/logger';
import type { BunPlugin } from 'bun';
import { createImagePlugin, createImagePluginBundler } from './bun-plugins';
import { ImageProcessor } from './image-processor';
import type { ImageSize, ImageSpecifications } from './types';
import { anyCaseToCamelCase } from './utils';

const logger = new Logger('[@ecopages/image-processor]', {
	debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * Configuration for the image processor
 */
export interface ImageProcessorConfig {
	sourceDir: string;
	outputDir: string;
	publicPath: string;
	/**
	 * @default []
	 */
	sizes: ImageSize[];
	quality: number;
	format: 'webp' | 'jpeg' | 'png' | 'avif';
	/**
	 * Optional list of accepted image formats
	 * @default ["jpg", "jpeg", "png", "webp"]
	 */
	acceptedFormats?: string[];
	/**
	 * @default true
	 */
	cacheEnabled?: boolean;
}

/**
 * ImageMap
 * This is the representation of the image map in the virtual module
 */
export type ImageMap = Record<string, ImageSpecifications>;

/**
 * ImageProcessorPlugin
 * A Processor for optimizing images.
 */
export class ImageProcessorPlugin extends Processor<ImageProcessorConfig> {
	private declare processor: ImageProcessor;
	public processedImages: Record<string, ImageSpecifications> = {};

	constructor(config: Omit<ProcessorConfig<ImageProcessorConfig>, 'name' | 'description'>) {
		const defaultWatchConfig: ProcessorWatchConfig = {
			paths: [],
			extensions: config.options?.acceptedFormats ?? ['jpg', 'jpeg', 'png', 'webp'],
			onCreate: async (filePath: string) => this.process([filePath]),
			onChange: async (filePath) => this.process([filePath]),
			onDelete: async (filePath) => this.deleteProcessedImagesbyPath(filePath),
			onError: (error) => logger.error('Watcher error', { error }),
		};

		super({
			...config,
			name: 'ecopages-image-processor',
			description: 'A Processor for optimizing images.',
			watch: config.watch ? deepMerge(defaultWatchConfig, config.watch) : defaultWatchConfig,
		});
	}

	get buildPlugins(): BunPlugin[] {
		return [createImagePluginBundler(this.processedImages)];
	}

	get plugins(): BunPlugin[] {
		return [createImagePlugin(this.processedImages)];
	}

	/**
	 * Generate dependencies for processor.
	 * It is ossible to define which one should be included in the final bundle based on the environment.
	 * @returns
	 */
	private generateDependencies(): AssetDefinition[] {
		const deps: AssetDefinition[] = [];

		if (import.meta.env.NODE_ENV === 'development') {
			/**
			 * Here we can define the dependencies for the development environment
			 * @example
			 * deps.push(
			 *   AssetFactory.createInlineScriptAsset({
			 *     content: `document.addEventListener("DOMContentLoaded",() => console.log("[@ecopages/image-processor] Processor is loaded"));`,
			 *     attributes: {
			 *       type: 'module',
			 *     },
			 *   }),
			 * );
			 */
		}

		return deps;
	}

	/**
	 * Setup the image processor and create the virtual module.
	 */
	async setup(): Promise<void> {
		if (!this.context) {
			throw new Error('ImageProcessor requires context to be set');
		}

		logger.debug('Setting up image processor', {
			srcDir: this.context.srcDir,
			distDir: this.context.distDir,
		});

		const defaultConfig = {
			sourceDir: `${this.context.srcDir}/public/assets/images`,
			outputDir: `${this.context.distDir}/public/assets/optimized`,
			publicPath: '/public/assets/optimized',
			sizes: [],
			quality: 80,
			format: 'webp' as const,
		};

		const config = this.options ? deepMerge(defaultConfig, this.options) : defaultConfig;

		this.processor = new ImageProcessor(config, {
			readCache: (key) => this.readCache(key),
			writeCache: (key, data) => this.writeCache(key, data),
		});

		this.processedImages = await this.processor.processDirectory();

		if (this.watchConfig) {
			this.watchConfig.paths = [config.sourceDir];
		}

		this.dependencies = this.generateDependencies();

		this.generateTypes();
	}

	/**
	 * Process images.
	 * @param images
	 */
	async process(images: string[]): Promise<void> {
		if (!this.processor) {
			throw new Error('ImageProcessor not initialized');
		}

		logger.debug('Processing images', { count: images.length });

		for (const image of images) {
			try {
				const result = await this.processor.processImage(image);
				if (result) {
					this.processedImages[path.basename(image)] = result;
				}
			} catch (error) {
				logger.error('Failed to process image', { image, error });
			}
		}

		this.generateTypes();
	}

	/**
	 * Delete processed images using the original image path.
	 * @param imagePath
	 */
	async deleteProcessedImagesbyPath(imagePath: string): Promise<void> {
		if (!this.processor) {
			throw new Error('ImageProcessor not initialized');
		}

		logger.debug('Deleting processed images', { path: imagePath });

		try {
			const baseNameWithoutExt = path.basename(imagePath, path.extname(imagePath));

			if (!this.options) {
				throw new Error('Options not set');
			}

			const outputDir = this.options.outputDir;

			const files = await FileUtils.glob([`${outputDir}/${baseNameWithoutExt}-*`]);

			await Promise.all(
				files.map(async (file) => {
					try {
						await FileUtils.rmAsync(file);
						logger.debug('Deleted processed image', { file });
					} catch (error) {
						logger.error('Failed to delete processed image', { file, error });
					}
				}),
			);

			try {
				const cacheKey = this.processedImages[path.basename(imagePath)].cacheKey;
				const cachePath = this.getCachePath(cacheKey);
				await FileUtils.rmAsync(cachePath);
				logger.debug('Deleted cache file for image', { cachePath });
			} catch (error) {
				logger.error('Failed to delete cache file for image', { imagePath, error });
			}

			delete this.processedImages[path.basename(imagePath)];

			this.generateTypes();
		} catch (error) {
			logger.error('Failed to delete processed images', { path: imagePath, error });
		}
	}

	/**
	 * Generate types for the virtual module.
	 */
	private generateTypes(): void {
		if (!this.options?.outputDir) {
			throw new Error('Output directory not set');
		}

		const requiredTypes = FileUtils.readFileSync(path.join(__dirname, 'types.ts'))
			.toString()
			.replaceAll('export ', '');

		const content = `
/**
 * Do not edit manually. This file is auto-generated.
 * This file contains the type definitions for the virtual module "ecopages:images".
 */

${requiredTypes}

declare module "ecopages:images" {
	${Object.keys(this.processedImages)
		.map((key) => `export const ${anyCaseToCamelCase(key)}: ImageSpecifications;`)
		.join('\n    ')}
}`;

		if (!this.context) throw new Error('Processor is not configured correctly');

		const typesDir = resolveGeneratedPath('types', {
			root: this.context.rootDir,
			module: this.name,
			subPath: 'virtual-module.d.ts',
			ensureDirExists: true,
		});

		FileUtils.writeFileSync(typesDir, content);
		logger.debug('Generated types for virtual module', { typesDir });
	}

	/**
	 * Teardown the image processor.
	 */
	async teardown(): Promise<void> {
		logger.debug('Tearing down image processor');
	}

	/**
	 * Get the image processor instance.
	 * @returns The image processor instance.
	 */
	getProcessor(): ImageProcessor | undefined {
		return this.processor;
	}
}

export const imageProcessorPlugin = (
	config: Omit<ProcessorConfig<ImageProcessorConfig>, 'name' | 'description'>,
): ImageProcessorPlugin => {
	return new ImageProcessorPlugin(config);
};
