import { defineConfig, devices } from '@playwright/test';
import { configurePlaywrightColorEnv } from './e2e/playwright/playwright-color-env.mjs';
import './e2e/playwright/strip-inherited-pwdebug.mjs';

configurePlaywrightColorEnv(process.env);

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	workers: '100%',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		headless: true,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'docs-e2e',
			testMatch: 'e2e/fixtures/docs/**/*.test.e2e.ts',
			use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4009' },
		},
	],
	webServer: {
		command: 'pnpm --filter @ecopages/docs run build && pnpm --filter @ecopages/docs run preview',
		url: 'http://localhost:4009',
		timeout: 300_000,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'production',
			ECOPAGES_PORT: '4009',
			ECOPAGES_PREVIEW_SERVE_ONLY: 'true',
		},
	},
});
