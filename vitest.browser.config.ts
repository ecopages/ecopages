import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineProject({
	resolve: {
		alias: {
			'@': path.resolve(rootDir, 'apps/docs/src'),
		},
	},
	test: {
		name: 'browser',
		include: [
			'packages/**/*.test.browser.ts',
			'packages/**/*.test.browser.tsx',
			'apps/**/*.test.browser.ts',
			'apps/**/*.test.browser.tsx',
		],
		benchmark: {
			include: [],
		},
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: 'chromium' }],
		},
	},
});
