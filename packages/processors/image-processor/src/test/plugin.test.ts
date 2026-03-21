import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { GENERATED_BASE_PATHS } from '@ecopages/core/constants';
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

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('ImageProcessorPlugin', () => {
	test('setup rehydrates generated files after dist cleanup removes them', async () => {
		const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-image-processor-plugin-'));
		tempRoots.push(rootDir);

		const sourceDir = path.join(rootDir, 'src', 'images');
		const outputDir = path.join(rootDir, 'dist', 'images');
		const imagePath = path.join(sourceDir, 'hero.png');
		fs.mkdirSync(sourceDir, { recursive: true });
		await createTestImage(imagePath);

		const plugin = imageProcessorPlugin({
			options: {
				sourceDir,
				outputDir,
				publicPath: '/images',
				quality: 80,
				format: 'webp',
				sizes: [{ width: 320, label: 'sm' }],
			},
		});

		await new ConfigBuilder()
			.setRootDir(rootDir)
			.setBaseUrl('http://localhost:3000')
			.setProcessors([plugin])
			.build();

		const runtimeVirtualModulePath = path.join(
			rootDir,
			'dist',
			GENERATED_BASE_PATHS.cache,
			'ecopages-image-processor',
			'virtual-module.ts',
		);

		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
		expect(fs.existsSync(runtimeVirtualModulePath)).toBe(true);

		fs.rmSync(path.join(rootDir, 'dist'), { recursive: true, force: true });

		await plugin.setup();

		expect(fs.readdirSync(outputDir).some((file) => file.endsWith('.webp'))).toBe(true);
		expect(fs.existsSync(runtimeVirtualModulePath)).toBe(true);
	});
});
