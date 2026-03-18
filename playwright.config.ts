import { defineConfig, devices } from '@playwright/test';

const coreE2ePort = 43102;
const corePostcssE2ePort = 43108;
const reuseExistingServer = process.env.ECOPAGES_REUSE_TEST_SERVERS === 'true';

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'core-e2e',
			testMatch: 'packages/core/**/*.test.e2e.ts',
			testIgnore: ['packages/core/**/*.postcss.test.e2e.ts', 'packages/core/dist/**/*.test.e2e.ts'],
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
				baseURL: `http://localhost:${coreE2ePort}`,
			},
		},
		{
			name: 'core-postcss-e2e',
			testMatch: 'packages/core/**/*.postcss.test.e2e.ts',
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
				baseURL: `http://localhost:${corePostcssE2ePort}`,
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
			testIgnore: ['**/persist-layouts.test.e2e.ts', '**/*hmr*.test.e2e.ts'],
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4003',
			},
		},
		{
			name: 'react-router-persist-layouts-e2e',
			testMatch: 'e2e/tests/react-router/persist-layouts.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4004',
			},
		},
		{
			name: 'react-router-persist-layouts-dev-e2e',
			testMatch: 'e2e/tests/react-router/persist-layouts-hmr.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4006',
			},
		},
		{
			name: 'cache-e2e',
			testMatch: 'e2e/tests/cache/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4005',
			},
		},
		{
			name: 'react-playground-e2e',
			testMatch: 'e2e/tests/react-playground/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:3001',
			},
		},
		{
			name: 'kitchen-sink-e2e',
			testMatch: 'playground/kitchen-sink/e2e/**/*.test.e2e.ts',
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4007',
			},
		},
	],
	webServer: [
		{
			command: `NODE_ENV=development ECOPAGES_PORT=${coreE2ePort} bun run app.ts --dev`,
			cwd: 'packages/core/__fixtures__/app',
			port: coreE2ePort,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: `NODE_ENV=development ECOPAGES_USE_POSTCSS_PROCESSOR=true ECOPAGES_PORT=${corePostcssE2ePort} bun run app.ts --dev`,
			cwd: 'packages/core/__fixtures__/app',
			port: corePostcssE2ePort,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4005 bun run app.ts',
			cwd: 'e2e/fixtures/cache-app',
			port: 4005,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4002 bun run app.ts --preview',
			cwd: 'e2e/fixtures/browser-router-app',
			port: 4002,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4003 bun run app.ts --preview',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4003,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4004 ECOPAGES_PERSIST_LAYOUTS=true bun run app.ts --preview',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4004,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=development ECOPAGES_PORT=4006 ECOPAGES_PERSIST_LAYOUTS=true bun run app.ts --dev',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4006,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'ECOPAGES_PORT=3001 pnpm --filter @ecopages/playground-react run dev',
			cwd: '.',
			port: 3001,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=development ECOPAGES_PORT=4007 pnpm dev',
			cwd: 'playground/kitchen-sink',
			port: 4007,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	],
});
