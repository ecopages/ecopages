import { defineConfig, configDefaults } from 'vitest/config';

const isBunRuntime = typeof process.versions.bun === 'string';

const isBenchMode = process.env.ECOPAGES_BENCH === '1' || process.argv.includes('bench');

export default defineConfig({
	test: {
		silent: 'passed-only',
		benchmark: {
			include: ['playground/kitchen-sink/bench/**/*.bench.ts'],
		},
		projects: [
			'vitest.browser.config.ts',
			{
				test: {
					name: 'shared-core',
					environment: 'node',
					include: [
						'packages/core/src/**/*.test.ts',
						'packages/core/src/**/*.test.tsx',
						'packages/__internals/**/*.test.ts',
						'packages/__internals/**/*.test.tsx',
						'packages/ecopages/**/*.test.ts',
						'packages/ecopages/**/*.test.js',
						'packages/plugins/**/*.test.ts',
						'packages/processors/**/*.test.ts',
						'packages/integrations/**/*.test.ts',
						'packages/integrations/**/*.test.tsx',
						'packages/loaders/**/*.test.ts',
						'packages/file-system/**/*.test.ts',
						'packages/vite-plugin/**/*.test.ts',
						'e2e/scripts/**/*.test.ts',
						'scripts/**/*.test.ts',
						...(isBenchMode ? ['playground/kitchen-sink/bench/**/*.bench.ts'] : []),
						...(process.env.ECOPAGES_BENCH_E2E === '1'
							? ['playground/kitchen-sink/bench/e2e-hmr-bench.test.ts']
							: []),
					],
					exclude: [
						...configDefaults.exclude,
						'packages/**/*.test.node.ts',
						'packages/**/*.test.bun.ts',
						'playground/kitchen-sink/bench/**/*',
					],
				},
			},
			...(isBunRuntime
				? [
						{
							test: {
								name: 'bun-adapter',
								environment: 'node',
								include: ['packages/**/*.test.bun.ts'],
							},
						},
					]
				: []),
		],
	},
});
