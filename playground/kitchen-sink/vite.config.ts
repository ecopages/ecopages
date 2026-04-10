import path from 'node:path';
import { defineConfig } from 'vite';
import { ecopages } from '@ecopages/vite-plugin';
import appConfig from './eco.config';

export default defineConfig({
	plugins: [ecopages({ appConfig })],
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, './src'),
		},
	},
});
