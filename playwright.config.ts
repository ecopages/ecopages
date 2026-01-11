import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// workers: 1,
	reporter: 'list',
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'core-e2e',
			testMatch: 'packages/core/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3002',
			},
		},
		{
			name: 'browser-router-e2e',
			testMatch: 'e2e/tests/browser-router/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4002',
			},
		},
		{
			name: 'react-router-e2e',
			testMatch: 'e2e/tests/react-router/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4003',
			},
		},
	],
	webServer: [
		{
			command: 'NODE_ENV=development ECOPAGES_PORT=3002 bun run app.ts --dev',
			cwd: 'packages/core/fixtures/app',
			port: 3002,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'ECOPAGES_PORT=4002 bun run app.ts --preview',
			cwd: 'e2e/fixtures/browser-router-app',
			port: 4002,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'ECOPAGES_PORT=4003 bun run app.ts --preview',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4003,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	],
});
