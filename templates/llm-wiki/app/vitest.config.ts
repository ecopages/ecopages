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
		name: 'llm-wiki',
		environment: 'node',
		include: ['src/lib/**/*.test.ts'],
	},
});
