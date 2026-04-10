import { defineConfig, devices } from '@playwright/test';

const coreE2ePort = 43102;
const corePostcssE2ePort = 43108;
const kitchenSinkDir = 'playground/kitchen-sink';
const kitchenSinkTestMatch = `${kitchenSinkDir}/e2e/**/*.test.e2e.ts`;
const kitchenSinkPreviewMatch = `${kitchenSinkDir}/e2e/**/*.preview.test.e2e.ts`;
const kitchenSinkVariants = [
	{
		projectName: 'kitchen-sink-bun-e2e',
		previewProjectName: 'kitchen-sink-preview-bun-e2e',
		devPort: 4007,
		previewPort: 4008,
		devCommand: 'NODE_ENV=development pnpm exec ecopages dev --runtime bun --port 4007',
		previewCommand:
			'NODE_ENV=production pnpm exec ecopages build --runtime bun && pnpm exec ecopages preview --runtime bun --port 4008',
	},
	{
		projectName: 'kitchen-sink-node-e2e',
		previewProjectName: 'kitchen-sink-preview-node-e2e',
		devPort: 4010,
		previewPort: 4011,
		devCommand: 'NODE_ENV=development pnpm exec ecopages dev --runtime node --port 4010',
		previewCommand:
			'NODE_ENV=production pnpm exec ecopages build --runtime node && pnpm exec ecopages preview --runtime node --port 4011',
	},
	{
		projectName: 'kitchen-sink-vite-node-e2e',
		devPort: 4012,
		devCommand: 'ECOPAGES_KITCHEN_SINK_HOST=vite pnpm exec vite dev --port 4012 --logLevel silent',
	},
	{
		projectName: 'kitchen-sink-vite-bun-e2e',
		devPort: 4014,
		devCommand: 'ECOPAGES_KITCHEN_SINK_HOST=vite bunx vite dev --port 4014 --logLevel silent',
	},
] as const;
const reactPlaygroundE2ePort = 43101;
const reuseExistingServer = process.env.ECOPAGES_REUSE_TEST_SERVERS === 'true';

const kitchenSinkDevTestIgnore = [kitchenSinkPreviewMatch];
const kitchenSinkPreviewTestIgnore: string[] = [];

const kitchenSinkWithPreview = kitchenSinkVariants.filter(
	(
		variant,
	): variant is typeof variant & { previewProjectName: string; previewPort: number; previewCommand: string } =>
		'previewProjectName' in variant,
);

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	workers: 1,
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
			name: 'docs-e2e',
			testMatch: 'e2e/tests/docs/**/*.test.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4009',
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
				baseURL: `http://localhost:${reactPlaygroundE2ePort}`,
			},
		},
		...kitchenSinkVariants.map((variant) => ({
			name: variant.projectName,
			testMatch: kitchenSinkTestMatch,
			testIgnore: kitchenSinkDevTestIgnore,
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
				baseURL: `http://localhost:${variant.devPort}`,
			},
		})),
		...kitchenSinkWithPreview.map((variant) => ({
			name: variant.previewProjectName,
			testMatch: kitchenSinkPreviewMatch,
			testIgnore: kitchenSinkPreviewTestIgnore,
			workers: 1,
			use: {
				...devices['Desktop Chrome'],
				baseURL: `http://localhost:${variant.previewPort}`,
			},
		})),
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
			command: 'NODE_ENV=production ECOPAGES_PORT=4009 pnpm --filter @ecopages/docs run preview',
			cwd: '.',
			port: 4009,
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
			command: `ECOPAGES_PORT=${reactPlaygroundE2ePort} pnpm --filter @ecopages/playground-react run dev`,
			cwd: '.',
			port: reactPlaygroundE2ePort,
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		...kitchenSinkVariants.map((variant) => ({
			command: variant.devCommand,
			cwd: kitchenSinkDir,
			port: variant.devPort,
			reuseExistingServer,
			stdout: 'pipe' as const,
			stderr: 'pipe' as const,
		})),
		...kitchenSinkWithPreview.map((variant) => ({
			command: variant.previewCommand,
			cwd: kitchenSinkDir,
			port: variant.previewPort,
			reuseExistingServer,
			stdout: 'pipe' as const,
			stderr: 'pipe' as const,
		})),
	],
});
