import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: '.',
	// Remove global testMatch to let projects define it, or keep generic if patterns match
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
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
			name: 'react-router-e2e',
			testMatch: 'playground/react-router/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3003',
			},
		},
	],
	webServer: [
		{
			command: 'bun run packages/core/fixtures/test-server.ts',
			port: 3002,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'ECOPAGES_PORT=3003 bun run dev:playground-react-router',
			port: 3003,
			reuseExistingServer: !process.env.CI,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	],
});
