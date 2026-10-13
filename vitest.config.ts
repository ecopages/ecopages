/**
 * Root Vitest config: `shared-core` (node), `browser`, and one project per app or template that keeps its own `@` alias:
 * `docs`, `docs-starter` and `llm-wiki`.
 */
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
	test: {
		silent: 'passed-only',
		projects: [
			'vitest.browser.config.ts',
			'apps/docs/vitest.config.ts',
			'templates/docs-starter/vitest.config.ts',
			'templates/llm-wiki/app/vitest.config.ts',
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
						'playground/kitchen-sink/bench/*.test.ts',
						'playground/kitchen-sink/bench/lib/**/*.test.ts',
					],
					exclude: [...configDefaults.exclude, 'packages/**/*.test.node.ts', 'packages/**/*.test.bun.ts'],
				},
			},
		],
	},
});
