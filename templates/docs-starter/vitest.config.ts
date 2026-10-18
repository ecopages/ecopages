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
		name: 'docs-starter',
		environment: 'node',
		/**
		 * @remarks
		 * `scripts/generate-llm-docs.test.ts` reads the whole docs tree and passes the 5s default only with
		 * spare CPU, which a full `test:vitest` run does not leave it.
		 */
		testTimeout: 20_000,
		include: ['scripts/**/*.test.ts', 'src/lib/docs/**/*.test.ts', 'src/includes/**/*.test.tsx'],
	},
});
