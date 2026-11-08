import { defineConfig } from '@ecopages/core/config';
import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: process.env.ECOPAGES_BASE_URL,
	processors: [lightningCssProcessorPlugin({ targets: ['chrome 90'], minify: true })],
});
