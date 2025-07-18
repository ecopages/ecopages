import '@ecopages/bun-mdx-kitajs-loader';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { mdxPlugin } from '@ecopages/mdx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';

export default await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setIntegrations([kitajsPlugin(), litPlugin(), mdxPlugin()])
	.setError404Template('404.kita.tsx')
	.setProcessors([
		imageProcessorPlugin({
			options: {
				sourceDir: path.resolve(import.meta.dir, 'src/images'),
				outputDir: path.resolve(import.meta.dir, '.eco/public/images'),
				publicPath: '/public/images',
				acceptedFormats: ['jpg', 'jpeg', 'png', 'webp'],
				quality: 80,
				format: 'webp',
				sizes: [
					{ width: 320, label: 'sm' },
					{ width: 768, label: 'md' },
					{ width: 1024, label: 'lg' },
					{ width: 1920, label: 'xl' },
				],
			},
		}),
		postcssProcessorPlugin(),
	])
	.build();
