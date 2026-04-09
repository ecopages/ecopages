import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = process.env.ECOPAGES_REUSE_TEST_SERVERS === 'true';
const devPort = 4010;
const previewPort = 4011;

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	reporter: 'list',
	use: {
		...devices['Desktop Chrome'],
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'kitchen-sink-nitro-e2e',
			testIgnore: '**/*.preview.test.e2e.ts',
			use: {
				baseURL: `http://localhost:${devPort}`,
			},
		},
		{
			name: 'kitchen-sink-nitro-preview-e2e',
			testMatch: '**/*.preview.test.e2e.ts',
			use: {
				baseURL: `http://localhost:${previewPort}`,
			},
		},
	],
	webServer: [
		{
			command: `pnpm exec vite dev --port ${devPort}`,
			cwd: import.meta.dirname,
			port: devPort,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
			timeout: 120_000,
		},
		{
			command: `pnpm exec vite build && pnpm exec vite preview --port ${previewPort}`,
			cwd: import.meta.dirname,
			port: previewPort,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
			timeout: 120_000,
		},
	],
});
