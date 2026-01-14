import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { kitajsPlugin } from '@ecopages/kitajs';
import { mdxPlugin } from '@ecopages/mdx';
import { imageProcessorPlugin } from '@ecopages/image-processor';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const config = await new ConfigBuilder()
	.setRootDir(import.meta.dir)
	.setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
	.setIntegrations([
		kitajsPlugin(),
		mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
			},
		}),
	])
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
		postcssProcessorPlugin(
			tailwindV4Preset({
				referencePath: path.resolve(import.meta.dir, 'src/styles/tailwind.css'),
			}),
		),
	])
	.setError404Template('404.kita.tsx')
	.setIncludesTemplates({
		head: 'head.kita.tsx',
		html: 'html.kita.tsx',
		seo: 'seo.kita.tsx',
	})
	.build();

export default config;
