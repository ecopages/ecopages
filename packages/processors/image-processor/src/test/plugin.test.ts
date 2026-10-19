import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { GENERATED_BASE_PATHS } from '@ecopages/core/build';
import { ImageProcessor } from '../image-processor';
import { imageProcessorPlugin } from '../plugin';

const tempRoots: string[] = [];

async function createTestImage(filePath: string, background = '#ffffff'): Promise<void> {
	await sharp({
		create: {
			width: 1200,
			height: 800,
			channels: 4,
			background,
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
	test('routes a watch batch through one processing call and each deleted source', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-watch-batch-'));
		tempRoots.push(rootDir);
		const plugin = createImageProcessorPlugin({
			sourceDir: path.join(rootDir, 'src', 'images'),
			outputDir: path.join(rootDir, 'dist', 'images'),
		});
		const processSpy = vi.spyOn(plugin, 'process').mockResolvedValue();
		const deleteSpy = vi.spyOn(plugin, 'deleteProcessedImagesbyPath').mockResolvedValue();
		const watchConfig = plugin.getWatchConfig();
		if (!watchConfig?.onChanges) {
			throw new Error('Expected image processor batched watch handler');
		}

		await watchConfig.onChanges({
			created: ['/images/created.png'],
			changed: ['/images/changed.png'],
			deleted: ['/images/deleted.png'],
			bridge: {} as never,
		});

		expect(processSpy).toHaveBeenCalledTimes(1);
		expect(processSpy).toHaveBeenCalledWith(['/images/created.png', '/images/changed.png']);
		expect(deleteSpy).toHaveBeenCalledTimes(1);
		expect(deleteSpy).toHaveBeenCalledWith('/images/deleted.png');
	});

	test('finalization leaves images and generated types alone until setup', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-prepare-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			baseUrl: 'http://localhost:3000',
			processors: [plugin],
		});
		plugin.setContext(appConfig);

		const typesDir = path.join(rootDir, GENERATED_BASE_PATHS.types, plugin.name);
		const typesFile = path.join(typesDir, 'virtual-module.d.ts');

		expect(fs.existsSync(typesFile)).toBe(false);
		expect(fs.existsSync(outputDir)).toBe(false);

		await plugin.setup();

		expect(fs.readFileSync(typesFile, 'utf8')).toContain('declare module "ecopages:images"');
		expect(fs.readFileSync(typesFile, 'utf8')).toContain('export const heroPng: ImageSpecifications;');
		expect(JSON.parse(fs.readFileSync(path.join(typesDir, 'package.json'), 'utf8'))).toMatchObject({
			name: '@types/ecopages-image-processor',
			types: './index.d.ts',
		});
		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
	});

	test('finalization followed by setup processes images exactly once', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-once-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(path.join(sourceDir, 'hero.png'));

		const processDirectorySpy = vi.spyOn(ImageProcessor.prototype, 'processDirectory');
		const plugin = createImageProcessorPlugin({ sourceDir, outputDir });

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			baseUrl: 'http://localhost:3000',
			processors: [plugin],
		});
		plugin.setContext(appConfig);

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

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			baseUrl: 'http://localhost:3000',
			processors: [plugin],
		});
		plugin.setContext(appConfig);

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

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			baseUrl: 'http://localhost:3000',
			processors: [plugin],
		});
		plugin.setContext(appConfig);

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

		const appConfig = await finalizeEcoPagesConfig({
			rootDir,
			baseUrl: 'http://localhost:3000',
			processors: [plugin],
		});
		plugin.setContext(appConfig);

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

	describe('watch deletions and edits', () => {
		async function setupPlugin(rootDir: string, images: Record<string, string>) {
			const sourceDir = path.join(rootDir, 'src', 'images');
			fs.mkdirSync(sourceDir, { recursive: true });
			for (const [name, background] of Object.entries(images)) {
				await createTestImage(path.join(sourceDir, name), background);
			}

			const plugin = createImageProcessorPlugin({
				sourceDir,
				outputDir: path.join(rootDir, 'dist', 'images'),
				sizes: [
					{ width: 320, label: 'sm' },
					{ width: 640, label: 'md' },
				],
			});
			const appConfig = await finalizeEcoPagesConfig({
				rootDir,
				baseUrl: 'http://localhost:3000',
				processors: [plugin],
			});
			plugin.setContext(appConfig);
			await plugin.setup();

			const outputDir = path.join(rootDir, 'dist', 'images');
			const onChanges = plugin.getWatchConfig()?.onChanges;
			if (!onChanges) {
				throw new Error('Expected image processor batched watch handler');
			}

			return {
				plugin,
				sourceDir,
				outputDir,
				notify: (changes: { created?: string[]; changed?: string[]; deleted?: string[] }) =>
					onChanges({ created: [], changed: [], deleted: [], ...changes, bridge: {} as never }),
			};
		}

		test('deleting a source image removes its optimized files', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-delete-'));
			tempRoots.push(rootDir);
			const { plugin, sourceDir, outputDir, notify } = await setupPlugin(rootDir, {
				'hero.png': '#ff0000',
				'other.png': '#0000ff',
			});
			const heroFiles = plugin.processedImages['hero.png'].variants.map((variant) => path.basename(variant.src));
			const otherFiles = plugin.processedImages['other.png'].variants.map((variant) =>
				path.basename(variant.src),
			);
			expect(heroFiles).toHaveLength(2);

			fs.rmSync(path.join(sourceDir, 'hero.png'));
			await notify({ deleted: [path.join(sourceDir, 'hero.png')] });

			for (const file of heroFiles) {
				expect(fs.existsSync(path.join(outputDir, file))).toBe(false);
			}
			for (const file of otherFiles) {
				expect(fs.existsSync(path.join(outputDir, file))).toBe(true);
			}
			expect(plugin.processedImages['hero.png']).toBeUndefined();
		});

		test('editing a source image removes the files of its previous version', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-edit-'));
			tempRoots.push(rootDir);
			const { plugin, sourceDir, outputDir, notify } = await setupPlugin(rootDir, { 'hero.png': '#ff0000' });
			const before = plugin.processedImages['hero.png'].variants.map((variant) => path.basename(variant.src));

			await createTestImage(path.join(sourceDir, 'hero.png'), '#00ff00');
			await notify({ changed: [path.join(sourceDir, 'hero.png')] });

			const after = plugin.processedImages['hero.png'].variants.map((variant) => path.basename(variant.src));
			expect(after).not.toEqual(before);
			for (const file of before) {
				expect(fs.existsSync(path.join(outputDir, file))).toBe(false);
			}
			for (const file of after) {
				expect(fs.existsSync(path.join(outputDir, file))).toBe(true);
			}
		});

		test('keeps a shared optimized file until its last source image is gone', async () => {
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-shared-'));
			tempRoots.push(rootDir);
			const { plugin, sourceDir, outputDir, notify } = await setupPlugin(rootDir, {
				'a.png': '#ff00ff',
				'b.png': '#ff00ff',
			});
			const files = plugin.processedImages['a.png'].variants.map((variant) => path.basename(variant.src));
			expect(plugin.processedImages['b.png'].variants.map((variant) => path.basename(variant.src))).toEqual(
				files,
			);

			await notify({ deleted: [path.join(sourceDir, 'a.png')] });
			for (const file of files) {
				expect(fs.existsSync(path.join(outputDir, file))).toBe(true);
			}

			await notify({ deleted: [path.join(sourceDir, 'b.png')] });
			for (const file of files) {
				expect(fs.existsSync(path.join(outputDir, file))).toBe(false);
			}
		});
	});
});
