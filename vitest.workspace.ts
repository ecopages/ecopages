import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
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
			exclude: ['packages/**/*.test.node.ts', 'packages/**/*.test.bun.ts'],
		},
	},
	{
		test: {
			name: 'node-adapter',
			environment: 'node',
			include: ['packages/core/src/**/*.test.node.ts'],
		},
	},
]);
