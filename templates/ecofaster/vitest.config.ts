import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, 'src'),
		},
	},
	oxc: {
		jsx: { runtime: 'automatic', importSource: '@ecopages/jsx' },
	},
	test: {
		name: 'ecofaster',
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
