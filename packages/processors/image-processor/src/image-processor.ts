import path from 'node:path';
import { writeHashedBrowserAsset } from '@ecopages/core/assets/hashed-browser-asset';
import { mergeProcessorOptions } from '@ecopages/core/plugins/processor';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import sharp, { type Metadata } from 'sharp';
import { ImageUtils } from './image-utils.ts';
import type { ImageMap, ImageProcessorConfig } from './plugin.ts';
import type { ImageAttributes, ImageSpecifications, ImageVariant } from './types.ts';

const appLogger = new Logger('[@ecopages/image-processor]', {
	debug: process.env.ECOPAGES_LOGGER_DEBUG === 'true',
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
		this.config = mergeProcessorOptions({ cacheEnabled: true }, config);
		this.cacheManager = cacheManager;
		fileSystem.ensureDir(this.config.outputDir);
	}

	private async calculateDimensions(metadata: Metadata, targetWidth: number) {
		const originalWidth = metadata.width || 0;
		const originalHeight = metadata.height || 0;
		const aspectRatio = originalHeight / originalWidth;
		const width = Math.min(targetWidth, originalWidth);
		const height = Math.round(width * aspectRatio);
		return { width, height };
	}

	/**
	 * @remarks
	 * Includes encoding options so a quality or format change cannot reuse a previous
	 * variant. File names come from a hash of the encoded bytes, not this key.
	 */
	private encodingCacheKey(imagePath: string, fileHash: string): string {
		const sizesKey = this.config.sizes.map((size) => `${size.width}:${size.label}`).join(',');
		return `${path.basename(imagePath)}:${fileHash}:q${this.config.quality}:${this.config.format}:${sizesKey}`;
	}

	private writeEncodedVariant(bytes: Buffer): string {
		return writeHashedBrowserAsset({
			bytes,
			directory: this.config.outputDir,
			extension: `.${this.config.format}`,
		});
	}

	async processImage(imagePath: string): Promise<ImageSpecifications | null> {
		try {
			const fileHash = fileSystem.hash(imagePath);
			const cacheKey = this.encodingCacheKey(imagePath, fileHash);

			if (this.config.cacheEnabled) {
				const cached = await this.cacheManager.readCache<ImageSpecifications>(cacheKey);
				if (cached) {
					const mainFilePath = path.join(this.config.outputDir, path.basename(cached.attributes.src));
					const mainFileExists = fileSystem.exists(mainFilePath);
					const variantsExist = cached.variants.every((variant) =>
						fileSystem.exists(path.join(this.config.outputDir, path.basename(variant.src))),
					);

					if (mainFileExists && variantsExist) {
						appLogger.debug(`Cache hit for ${imagePath}`);
						return cached;
					}

					appLogger.debug(`Cache invalid for ${imagePath}, reprocessing`);
				}
			}

			fileSystem.ensureDir(this.config.outputDir);

			const metadata = await sharp(imagePath).metadata();
			const originalWidth = metadata.width || 0;
			const originalHeight = metadata.height || 0;

			if (this.config.sizes.length === 0) {
				const encoded = await sharp(imagePath)
					.toFormat(this.config.format, { quality: this.config.quality })
					.toBuffer();
				const outputPath = this.writeEncodedVariant(encoded);
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
					const encoded = await sharp(imagePath)
						.resize(width, height)
						.toFormat(this.config.format, { quality: this.config.quality })
						.toBuffer();
					const outputPath = this.writeEncodedVariant(encoded);
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

		const images = await fileSystem.glob([`${this.config.sourceDir}/**/*.{${acceptedFormats.join(',')}}`]);

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
		if (process.env.ECOPAGES_BENCH === '1' && process.env.ECOPAGES_BENCH_VERBOSE !== '1') {
			appLogger.debug(`Processed ${results.length} images`);
		} else {
			appLogger.info(`Processed ${results.length} images`);
		}

		return Object.fromEntries(results);
	}
}
