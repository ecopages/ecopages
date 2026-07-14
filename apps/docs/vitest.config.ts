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
		include: ['scripts/**/*.test.ts', 'src/docs-kit/**/*.test.ts'],
		setupFiles: ['./vitest.setup.ts'],
	},
});
