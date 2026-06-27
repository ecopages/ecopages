import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { GENERATED_BASE_PATHS } from '@ecopages/core/constants';
import { ImageProcessor } from '../image-processor';
import { imageProcessorPlugin } from '../plugin';

const tempRoots: string[] = [];

async function createTestImage(filePath: string): Promise<void> {
	await sharp({
		create: {
			width: 1200,
			height: 800,
			channels: 4,
			background: '#ffffff',
		},
	})
		.png()
		.toFile(filePath);
}

function createImageProcessorPlugin(options: {
	sourceDir: string;
	outputDir: string;
	publicPath?: string;
	sizes?: Array<{ width: number; label: string }>;
}) {
	return imageProcessorPlugin({
		options: {
			sourceDir: options.sourceDir,
			outputDir: options.outputDir,
			publicPath: options.publicPath ?? '/images',
			quality: 80,
			format: 'webp',
			sizes: options.sizes ?? [{ width: 320, label: 'sm' }],
		},
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('ImageProcessorPlugin', () => {
	test('prepareBuildContributions does not process images', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-prepare-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const processDirectorySpy = vi.spyOn(ImageProcessor.prototype, 'processDirectory');
		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		expect(processDirectorySpy).not.toHaveBeenCalled();
		expect(
			fs.existsSync(outputDir) ? fs.readdirSync(outputDir).some((file) => file.endsWith('.webp')) : false,
		).toBe(false);
	});

	test('config build followed by setup processes images exactly once', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-once-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const processDirectorySpy = vi.spyOn(ImageProcessor.prototype, 'processDirectory');
		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		expect(processDirectorySpy).not.toHaveBeenCalled();

		await plugin.setup();

		expect(processDirectorySpy).toHaveBeenCalledTimes(1);
		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
	});

	test('setup rehydrates generated files after dist cleanup removes them', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-plugin-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		const imagePath = path.join(sourceDir, 'hero.png');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(imagePath);

		const processDirectorySpy = vi.spyOn(ImageProcessor.prototype, 'processDirectory');
		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		expect(processDirectorySpy).not.toHaveBeenCalled();
		expect(
			fs.existsSync(outputDir) ? fs.readdirSync(outputDir).some((file) => file.endsWith('.webp')) : false,
		).toBe(false);

		await plugin.setup();

		const runtimeVirtualModulePath = path.join(
			rootDir,
			'dist',
			GENERATED_BASE_PATHS.cache,
			'ecopages-image-processor',
			'virtual-module.ts',
		);

		expect(processDirectorySpy).toHaveBeenCalledTimes(1);
		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
		expect(fs.existsSync(runtimeVirtualModulePath)).toBe(true);

		fs.rmSync(path.join(rootDir, 'dist'), { recursive: true, force: true });

		await plugin.setup();

		expect(processDirectorySpy).toHaveBeenCalledTimes(2);
		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
		expect(fs.existsSync(runtimeVirtualModulePath)).toBe(true);
	});

	test('setup syncs processed images from disk without invoking sharp', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-sync-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		await plugin.setup();

		const processDirectorySpy = vi.spyOn(ImageProcessor.prototype, 'processDirectory');

		await plugin.setup();

		expect(processDirectorySpy).not.toHaveBeenCalled();
		expect(Object.keys(plugin.processedImages)).toContain('hero.png');
		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
	});

	test('setup processes images when virtual module exists but outputs were removed', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-stale-module-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const processDirectorySpy = vi.spyOn(ImageProcessor.prototype, 'processDirectory');
		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		await plugin.setup();
		expect(processDirectorySpy).toHaveBeenCalledTimes(1);

		for (const file of fs.readdirSync(outputDir)) {
			if (file.endsWith('.webp')) {
				fs.rmSync(path.join(outputDir, file));
			}
		}

		await plugin.setup();

		expect(processDirectorySpy).toHaveBeenCalledTimes(2);
		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
	});

	test('skips image processing in Lit static render worker threads', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-worker-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const previousWorkerFlag = process.env.ECOPAGES_LIT_STATIC_RENDER_WORKER;
		process.env.ECOPAGES_LIT_STATIC_RENDER_WORKER = 'true';

		try {
			const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

			await new ConfigBuilder()
				.setRootDir(rootDir)
				.setBaseUrl('http://localhost:3000')
				.setProcessors([plugin])
				.build();

			expect(fs.existsSync(outputDir)).toBe(false);
			await plugin.setup();
			expect(fs.existsSync(outputDir)).toBe(false);
		} finally {
			if (previousWorkerFlag === undefined) {
				delete process.env.ECOPAGES_LIT_STATIC_RENDER_WORKER;
			} else {
				process.env.ECOPAGES_LIT_STATIC_RENDER_WORKER = previousWorkerFlag;
			}
		}
	});
});
