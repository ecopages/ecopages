import path from 'node:path';
import { defineConfig } from 'vite';
import { ecopages } from '@ecopages/vite-plugin';
import { nitroHost } from '@ecopages/vite-plugin/nitro';
import { nitro } from 'nitro/vite';
import appConfig from './eco.config';

export default defineConfig({
	plugins: [ecopages({ appConfig, host: nitroHost(nitro) })],
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, './src'),
		},
	},
});
