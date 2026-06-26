/**
 * Kitchen-sink Playwright matrix: host × runtime × mode.
 *
 * Each row boots `playground/kitchen-sink` inside `.e2e-tmp/` via
 * `run-isolated-app.mjs`. Read-only dev/preview rows share one copied tree
 * (`kitchenSinkSharedWorkspace`); HMR keeps an isolated copy because tests
 * mutate source files.
 *
 * `workspace` — `.e2e-tmp/<name>` directory for the copied app.
 * `artifactScope` — suffix for scoped `dist-*` / `.eco-*` dirs inside that copy
 *   (see `ECOPAGES_E2E_ARTIFACT_SCOPE` in `run-isolated-app.mjs`).
 */
import path from 'node:path';
import type { PlaywrightTestProject } from '@playwright/test';

export const kitchenSinkDir = 'playground/kitchen-sink';
export const kitchenSinkSharedWorkspace = 'kitchen-sink-shared';
export const isolatedAppLauncher = 'node e2e/scripts/playwright/run-isolated-app.mjs';

export const kitchenSinkTestMatch = `${kitchenSinkDir}/e2e/**/*.test.e2e.ts`;
export const kitchenSinkPreviewMatch = `${kitchenSinkDir}/e2e/**/*.preview.test.e2e.ts`;
export const kitchenSinkStatefulTestMatch = `${kitchenSinkDir}/e2e/includes-hmr.test.e2e.ts`;

const KITCHEN_SINK_DEV_TEST_TIMEOUT_MS = 90_000;
const KITCHEN_SINK_PREVIEW_TEST_TIMEOUT_MS = 60_000;

export type KitchenSinkProjectConfig = {
	name: string;
	port: number;
	host: 'ecopages' | 'vite';
	runtime: 'bun' | 'node';
	mode: 'dev' | 'preview';
	workspace: string;
	artifactScope: string;
	testMatch: string;
	testIgnore?: string[];
	workers?: number;
	timeout?: number;
};

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

export function buildIsolatedAppCommand(options: {
	sourceDir: string;
	host: 'ecopages' | 'vite';
	mode: 'dev' | 'preview';
	port: number;
	runtime: 'bun' | 'node';
	workspace: string;
	artifactScope: string;
}): string {
	return `${isolatedAppLauncher} --sourceDir ${options.sourceDir} --workspace ${options.workspace} --artifactScope ${options.artifactScope} --host ${options.host} --runtime ${options.runtime} --mode ${options.mode} --port ${options.port}`;
}

/**
 * Expands the host/runtime matrix into Playwright project rows.
 *
 * Dev and HMR always use `workers: 1` — dev shares one SSR server per host;
 * HMR mutates files. Preview uses `defaultWorkerCount` because output is static.
 */
export function createKitchenSinkProjects(defaultWorkerCount: number): KitchenSinkProjectConfig[] {
	const kitchenSinkDevWorkerCount = 1;
	const kitchenSinkHmrWorkerCount = 1;

	return kitchenSinkVariants.flatMap((variant) => {
		const projects: KitchenSinkProjectConfig[] = [
			{
				name: `${variant.baseName}-e2e`,
				port: variant.devPort,
				host: variant.host,
				runtime: variant.runtime,
				mode: 'dev',
				workspace: kitchenSinkSharedWorkspace,
				artifactScope: `${variant.baseName}-dev`,
				testMatch: kitchenSinkTestMatch,
				testIgnore: [kitchenSinkPreviewMatch, kitchenSinkStatefulTestMatch],
				workers: kitchenSinkDevWorkerCount,
				timeout: KITCHEN_SINK_DEV_TEST_TIMEOUT_MS,
			},
			{
				name: `${variant.baseName}-hmr-e2e`,
				port: variant.hmrPort,
				host: variant.host,
				runtime: variant.runtime,
				mode: 'dev',
				workspace: `${variant.baseName}-hmr`,
				artifactScope: `${variant.baseName}-hmr`,
				testMatch: kitchenSinkStatefulTestMatch,
				workers: kitchenSinkHmrWorkerCount,
				timeout: KITCHEN_SINK_DEV_TEST_TIMEOUT_MS,
			},
		];

		if ('previewPort' in variant && variant.previewPort) {
			projects.push({
				name: `${variant.baseName}-preview-e2e`,
				port: variant.previewPort,
				host: variant.host,
				runtime: variant.runtime,
				mode: 'preview',
				workspace: kitchenSinkSharedWorkspace,
				artifactScope: `${variant.baseName}-preview`,
				testMatch: kitchenSinkPreviewMatch,
				workers: defaultWorkerCount,
				timeout: KITCHEN_SINK_PREVIEW_TEST_TIMEOUT_MS,
			});
		}

		return projects;
	});
}

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

export function createKitchenSinkPlaywrightProjects(
	repoRootDir: string,
	kitchenSinkProjects: KitchenSinkProjectConfig[],
	desktopChrome: DesktopChromeUse,
) {
	return kitchenSinkProjects.map((project) => ({
		name: project.name,
		testMatch: project.testMatch,
		testIgnore: project.testIgnore,
		workers: project.workers,
		timeout: project.timeout,
		metadata: {
			artifactScope: project.artifactScope,
			isolatedAppDir: path.join(repoRootDir, '.e2e-tmp', project.workspace),
		},
		use: {
			...desktopChrome,
			baseURL: `http://localhost:${project.port}`,
		},
	}));
}

/**
 * Web servers for the kitchen-sink matrix.
 *
 * Shared-workspace rows set `ECOPAGES_MANAGE_ISOLATED_WORKSPACES` so
 * `run-isolated-app.mjs` coordinates teardown when multiple Playwright projects
 * reuse the same `.e2e-tmp/kitchen-sink-shared` copy.
 */
export function createKitchenSinkWebServers(
	kitchenSinkProjects: KitchenSinkProjectConfig[],
	reuseExistingServer: boolean,
) {
	return kitchenSinkProjects.map((project) => ({
		command: buildIsolatedAppCommand({
			sourceDir: kitchenSinkDir,
			workspace: project.workspace,
			artifactScope: project.artifactScope,
			host: project.host,
			runtime: project.runtime,
			mode: project.mode,
			port: project.port,
		}),
		cwd: '.',
		...(project.mode === 'dev' ? { url: `http://localhost:${project.port}/` } : { port: project.port }),
		projects: [project.name],
		reuseExistingServer,
		stdout: 'pipe' as const,
		stderr: 'pipe' as const,
		...(project.workspace === kitchenSinkSharedWorkspace
			? { env: { ECOPAGES_MANAGE_ISOLATED_WORKSPACES: 'true' } }
			: {}),
	}));
}
