import path from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRootDir = path.dirname(fileURLToPath(import.meta.url));
const coreE2ePort = 43102;
const corePostcssE2ePort = 43108;
const kitchenSinkDir = 'playground/kitchen-sink';
const isolatedAppLauncher = 'node scripts/playwright/run-isolated-app.mjs';
const kitchenSinkTestMatch = `${kitchenSinkDir}/e2e/**/*.test.e2e.ts`;
const kitchenSinkPreviewMatch = `${kitchenSinkDir}/e2e/**/*.preview.test.e2e.ts`;
const kitchenSinkStatefulTestMatch = `${kitchenSinkDir}/e2e/includes-hmr.test.e2e.ts`;

function buildIsolatedAppCommand(options: {
	sourceDir: string;
	host: 'ecopages' | 'vite';
	mode: 'dev' | 'preview';
	port: number;
	runtime: 'bun' | 'node';
	workspace: string;
}) {
	return `${isolatedAppLauncher} --sourceDir ${options.sourceDir} --workspace ${options.workspace} --host ${options.host} --runtime ${options.runtime} --mode ${options.mode} --port ${options.port}`;
}

type KitchenSinkProjectConfig = {
	name: string;
	port: number;
	host: 'ecopages' | 'vite';
	runtime: 'bun' | 'node';
	mode: 'dev' | 'preview';
	workspace: string;
	testMatch: string;
	testIgnore?: string[];
	workers?: number;
};

const kitchenSinkSourceDir = 'playground/kitchen-sink';
const kitchenSinkVariants = [
	{
		baseName: 'kitchen-sink-bun',
		devPort: 4007,
		hmrPort: 4016,
		previewPort: 4008,
		host: 'ecopages',
		runtime: 'bun',
	},
	{
		baseName: 'kitchen-sink-node',
		devPort: 4010,
		hmrPort: 4018,
		previewPort: 4011,
		host: 'ecopages',
		runtime: 'node',
	},
	{
		baseName: 'kitchen-sink-vite-node',
		devPort: 4012,
		hmrPort: 4020,
		host: 'vite',
		runtime: 'node',
	},
	{
		baseName: 'kitchen-sink-vite-bun',
		devPort: 4014,
		hmrPort: 4022,
		host: 'vite',
		runtime: 'bun',
	},
] as const;
const reactPlaygroundE2ePort = 43101;
const reuseExistingServer = process.env.ECOPAGES_REUSE_TEST_SERVERS === 'true';
const selectedProjects = new Set(
	(process.env.ECOPAGES_PLAYWRIGHT_PROJECTS ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean),
);

const maxAvailableWorkers = availableParallelism();
const defaultWorkerCount = maxAvailableWorkers > 1 ? maxAvailableWorkers : 1;
const kitchenSinkProjects: KitchenSinkProjectConfig[] = kitchenSinkVariants.flatMap((variant) => {
	const projects: KitchenSinkProjectConfig[] = [
		{
			name: `${variant.baseName}-e2e`,
			port: variant.devPort,
			host: variant.host,
			runtime: variant.runtime,
			mode: 'dev',
			workspace: `${variant.baseName}-dev`,
			testMatch: kitchenSinkTestMatch,
			testIgnore: [kitchenSinkPreviewMatch, kitchenSinkStatefulTestMatch],
			workers: defaultWorkerCount,
		},
		{
			name: `${variant.baseName}-hmr-e2e`,
			port: variant.hmrPort,
			host: variant.host,
			runtime: variant.runtime,
			mode: 'dev',
			workspace: `${variant.baseName}-hmr`,
			testMatch: kitchenSinkStatefulTestMatch,
			workers: 1,
		},
	];

	if ('previewPort' in variant && variant.previewPort) {
		projects.push({
			name: `${variant.baseName}-preview-e2e`,
			port: variant.previewPort,
			host: variant.host,
			runtime: variant.runtime,
			mode: 'preview',
			workspace: `${variant.baseName}-preview`,
			testMatch: kitchenSinkPreviewMatch,
		});
	}

	return projects;
});

type WebServerConfig = {
	command: string;
	cwd: string;
	port: number;
	projects: string[];
	stderr: 'pipe';
	stdout: 'pipe';
	reuseExistingServer: boolean;
};

function includeServerForProjects(projects: string[]) {
	return selectedProjects.size === 0 || projects.some((project) => selectedProjects.has(project));
}

const webServers: WebServerConfig[] = [
	{
		command: `NODE_ENV=development ECOPAGES_PORT=${coreE2ePort} bun run app.ts --dev`,
		cwd: 'packages/core/__fixtures__/app',
		port: coreE2ePort,
		projects: ['core-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: `NODE_ENV=development ECOPAGES_USE_POSTCSS_PROCESSOR=true ECOPAGES_PORT=${corePostcssE2ePort} bun run app.ts --dev`,
		cwd: 'packages/core/__fixtures__/app',
		port: corePostcssE2ePort,
		projects: ['core-postcss-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: 'NODE_ENV=production ECOPAGES_PORT=4005 bun run app.ts',
		cwd: 'e2e/fixtures/cache-app',
		port: 4005,
		projects: ['cache-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: 'NODE_ENV=production ECOPAGES_PORT=4002 bun run app.ts --preview',
		cwd: 'e2e/fixtures/browser-router-app',
		port: 4002,
		projects: ['browser-router-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command:
			'NODE_ENV=production pnpm --filter @ecopages/docs run build && NODE_ENV=production ECOPAGES_PORT=4009 pnpm --filter @ecopages/docs run preview',
		cwd: '.',
		port: 4009,
		projects: ['docs-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: 'NODE_ENV=production ECOPAGES_PORT=4003 bun run app.ts --preview',
		cwd: 'e2e/fixtures/react-router-app',
		port: 4003,
		projects: ['react-router-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: 'NODE_ENV=production ECOPAGES_PORT=4004 ECOPAGES_PERSIST_LAYOUTS=true bun run app.ts --preview',
		cwd: 'e2e/fixtures/react-router-app',
		port: 4004,
		projects: ['react-router-persist-layouts-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: 'NODE_ENV=development ECOPAGES_PORT=4006 ECOPAGES_PERSIST_LAYOUTS=true bun run app.ts --dev',
		cwd: 'e2e/fixtures/react-router-app',
		port: 4006,
		projects: ['react-router-persist-layouts-dev-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	{
		command: `ECOPAGES_PORT=${reactPlaygroundE2ePort} pnpm --filter @ecopages/playground-react run dev`,
		cwd: '.',
		port: reactPlaygroundE2ePort,
		projects: ['react-playground-e2e'],
		reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	},
	...kitchenSinkProjects.map((project) => ({
		command: buildIsolatedAppCommand({
			sourceDir: kitchenSinkSourceDir,
			workspace: project.workspace,
			host: project.host,
			runtime: project.runtime,
			mode: project.mode,
			port: project.port,
		}),
		cwd: '.',
		port: project.port,
		projects: [project.name],
		reuseExistingServer,
		stdout: 'pipe' as const,
		stderr: 'pipe' as const,
	})),
];

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	workers: defaultWorkerCount,
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
		...kitchenSinkProjects.map((project) => ({
			name: project.name,
			testMatch: project.testMatch,
			testIgnore: project.testIgnore,
			workers: project.workers,
			metadata: {
				isolatedAppDir: path.join(repoRootDir, '.e2e-tmp', project.workspace),
			},
			use: {
				...devices['Desktop Chrome'],
				baseURL: `http://localhost:${project.port}`,
			},
		})),
	],
	webServer: webServers.filter((server) => includeServerForProjects(server.projects)),
});
