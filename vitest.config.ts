/**
 * Root Vitest config: `shared-core` (node) and `browser`.
 *
 * Opt-in suites: `scripts/vitest-optional-includes.ts` + `e2e/README.md`.
 */
import { defineConfig, configDefaults } from 'vitest/config';
import { getOptionalVitestIncludes } from './scripts/vitest-optional-includes.ts';

export default defineConfig({
	test: {
		silent: 'passed-only',
		projects: [
			'vitest.browser.config.ts',
			{
				test: {
					name: 'shared-core',
					environment: 'node',
					unstubEnvs: true,
					unstubGlobals: true,
					restoreMocks: true,
					include: [
						'packages/codemod/**/*.test.ts',
						'packages/core/src/**/*.test.ts',
						'packages/core/src/**/*.test.tsx',
						'packages/__internals/**/*.test.ts',
						'packages/__internals/**/*.test.tsx',
						'packages/ecopages/**/*.test.ts',
						'packages/processors/**/*.test.ts',
						'packages/processors/**/*.test.tsx',
						'packages/integrations/**/*.test.ts',
						'packages/integrations/**/*.test.tsx',
						'packages/file-system/**/*.test.ts',
						'packages/react-router/**/*.test.ts',
						'packages/react-router/**/*.test.tsx',
						'packages/dev-toolbar/**/*.test.ts',
						'packages/dev-toolbar/**/*.test.tsx',
						'e2e/fixtures/*/*.test.ts',
						'e2e/scripts/**/*.test.ts',
						'e2e/playwright/**/*.test.ts',
						'scripts/**/*.test.ts',
						'playground/kitchen-sink/bench/lib/**/*.test.ts',
						...getOptionalVitestIncludes(),
					],
					exclude: [...configDefaults.exclude, 'packages/**/*.test.node.ts', 'packages/**/*.test.bun.ts'],
				},
			},
		],
	},
});
