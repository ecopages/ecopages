import path from 'node:path';
import { deepMerge, FileUtils } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import sharp from 'sharp';
import { ImageUtils } from './image-utils';
import type { ImageMap, ImageProcessorConfig } from './plugin';
import type { ImageAttributes, ImageSpecifications, ImageVariant } from './types';

const appLogger = new Logger('[@ecopages/image-processor]', {
	debug: import.meta.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

/**
 * ImageProcessor
 * This is the core class for processing images.
 * It uses the sharp library to resize and optimize images.
 */
export class ImageProcessor {
	private readonly config: ImageProcessorConfig;
	private readonly cacheManager: {
		readCache: <T>(key: string) => Promise<T | null>;
		writeCache: <T>(key: string, data: T) => Promise<void>;
	};

	constructor(
		config: ImageProcessorConfig,
		cacheManager: {
			readCache: <T>(key: string) => Promise<T | null>;
			writeCache: <T>(key: string, data: T) => Promise<void>;
		},
	) {
		this.config = deepMerge({ cacheEnabled: true }, config);
		this.cacheManager = cacheManager;
		FileUtils.ensureDirectoryExists(this.config.outputDir);
	}

	private async calculateDimensions(metadata: sharp.Metadata, targetWidth: number) {
		const originalWidth = metadata.width || 0;
		const originalHeight = metadata.height || 0;
		const aspectRatio = originalHeight / originalWidth;
		const width = Math.min(targetWidth, originalWidth);
		const height = Math.round(width * aspectRatio);
		return { width, height };
	}

	private getOutputPath(imagePath: string, width: number) {
		const hash = FileUtils.getFileHash(imagePath);
		const ext = path.extname(imagePath);
		const base = path.basename(imagePath, ext);
		const filename = `${base}-${hash}-${width}.${this.config.format}`;
		return path.join(this.config.outputDir, filename);
	}

	async processImage(imagePath: string): Promise<ImageSpecifications | null> {
		try {
			const fileHash = FileUtils.getFileHash(imagePath);
			const cacheKey = `${path.basename(imagePath)}:${fileHash}`;

			if (this.config.cacheEnabled) {
				const cached = await this.cacheManager.readCache<ImageSpecifications>(cacheKey);
				if (cached) {
					/**
					 * Verify that the files actually exist
					 * We construct the absolute path relative to the process current working directory
					 * since the src in attributes is relative from the root
					 */
					const mainFilePath = path.join(process.cwd(), cached.attributes.src);
					const mainFileExists = FileUtils.existsSync(mainFilePath);
					const variantsExist = cached.variants.every((v) =>
						FileUtils.existsSync(path.join(process.cwd(), v.src)),
					);

					if (mainFileExists && variantsExist) {
						appLogger.debug(`Cache hit for ${imagePath}`);
						return cached;
					}

					appLogger.debug(`Cache invalid for ${imagePath}, reprocessing`);
				}
			}

			FileUtils.ensureDirectoryExists(this.config.outputDir);

			const metadata = await sharp(imagePath).metadata();
			const originalWidth = metadata.width || 0;
			const originalHeight = metadata.height || 0;

			if (this.config.sizes.length === 0) {
				const outputPath = this.getOutputPath(imagePath, originalWidth);

				if (FileUtils.existsSync(outputPath)) {
					appLogger.debug(`Using existing file for ${imagePath}`);
				} else {
					await sharp(imagePath)
						.toFormat(this.config.format, { quality: this.config.quality })
						.toFile(outputPath);
				}

				const src = path.join(this.config.publicPath, path.basename(outputPath));

				const imageSpecifications: ImageSpecifications = {
					attributes: {
						src,
						width: originalWidth,
						height: originalHeight,
						sizes: '',
					},
					variants: [],
					cacheKey,
				};

				if (this.config.cacheEnabled) {
					await this.cacheManager.writeCache(cacheKey, imageSpecifications);
				}

				return imageSpecifications;
			}

			let applicableSizes = this.config.sizes
				.filter((size) => size.width <= originalWidth)
				.sort((a, b) => b.width - a.width);

			if (applicableSizes.length === 0) {
				applicableSizes = this.config.sizes.sort((a, b) => b.width - a.width).slice(0, 1);
			}

			const variants: ImageVariant[] = await Promise.all(
				applicableSizes.map(async ({ width: targetWidth, label }) => {
					const { width, height } = await this.calculateDimensions(metadata, targetWidth);
					const outputPath = this.getOutputPath(imagePath, width);

					if (FileUtils.existsSync(outputPath)) {
						appLogger.debug(`Variant ${width}px already exists for ${imagePath}`);
					} else {
						await sharp(imagePath)
							.resize(width, height)
							.toFormat(this.config.format, { quality: this.config.quality })
							.toFile(outputPath);
					}

					const src = path.join(this.config.publicPath, path.basename(outputPath));

					return {
						width,
						height,
						src,
						label,
					};
				}),
			);

			const mainVariant = variants[0];
			const attributes: ImageAttributes = {
				src: mainVariant.src,
				width: mainVariant.width,
				height: mainVariant.height,
				sizes: ImageUtils.generateSizes(variants),
				srcset: ImageUtils.generateSrcset(variants),
			};

			const imageSpecifications: ImageSpecifications = {
				attributes,
				variants,
				cacheKey,
			};

			if (this.config.cacheEnabled) {
				await this.cacheManager.writeCache(cacheKey, imageSpecifications);
			}

			return imageSpecifications;
		} catch (error) {
			appLogger.error(`Failed to process image ${imagePath}:`, error as Error);
			return null;
		}
	}

	async processDirectory(): Promise<ImageMap> {
		const acceptedFormats = this.config.acceptedFormats || ['jpg', 'jpeg', 'png', 'webp'];

		const images = await FileUtils.glob([`${this.config.sourceDir}/**/*.{${acceptedFormats.join(',')}}`]);

		appLogger.debugTime('Processing images');

		const results = (
			await Promise.all(
				images.map(async (file) => {
					const processed = await this.processImage(file);
					if (!processed) return null;
					return [path.basename(file), processed] as [string, ImageSpecifications];
				}),
			)
		).filter(Boolean) as [string, ImageSpecifications][];

		appLogger.debugTimeEnd('Processing images');
		appLogger.info(`Processed ${results.length} images`);

		return Object.fromEntries(results);
	}
}
