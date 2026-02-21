import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		name: 'bun-adapter',
		environment: 'node',
		include: ['packages/**/*.test.bun.ts'],
	},
});
