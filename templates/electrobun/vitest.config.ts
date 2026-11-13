import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'server',
					environment: 'node',
					include: ['test/**/*.test.ts'],
					unstubEnvs: true,
					unstubGlobals: true,
				},
			},
			{
				test: {
					name: 'browser',
					include: ['test/**/*.test.browser.ts'],
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: 'chromium' }],
						commands: {
							setColorScheme: ({ page }, colorScheme: 'light' | 'dark' | null) =>
								page.emulateMedia({ colorScheme }),
						},
					},
				},
			},
		],
	},
});
