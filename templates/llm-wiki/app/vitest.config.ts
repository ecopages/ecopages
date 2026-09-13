import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, 'src'),
		},
	},
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: '@ecopages/jsx',
	},
	test: {
		environment: 'node',
		include: ['src/lib/**/*.test.ts'],
	},
});
