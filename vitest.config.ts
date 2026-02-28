import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			'vitest.browser.config.ts',
			{
				test: {
					name: 'shared-core',
					environment: 'node',
					include: [
						'packages/core/src/**/*.test.ts',
						'packages/core/src/**/*.test.tsx',
						'packages/plugins/**/*.test.ts',
						'packages/processors/**/*.test.ts',
						'packages/integrations/**/*.test.ts',
						'packages/integrations/**/*.test.tsx',
						'packages/loaders/**/*.test.ts',
						'packages/file-system/**/*.test.ts',
					],
					exclude: [...configDefaults.exclude, 'packages/**/*.test.node.ts', 'packages/**/*.test.bun.ts'],
				},
			},
			{
				test: {
					name: 'bun-adapter',
					environment: 'node',
					include: ['packages/**/*.test.bun.ts'],
				},
			},
		],
	},
});
