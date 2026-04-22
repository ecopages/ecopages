import { defineProject } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineProject({
	test: {
		name: 'browser',
		include: [
			'packages/**/*.test.browser.ts',
			'packages/**/*.test.browser.tsx',
			'apps/**/*.test.browser.ts',
			'apps/**/*.test.browser.tsx',
		],
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: 'chromium' }],
		},
	},
});
