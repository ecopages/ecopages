/**
 * Isolated-app fixtures boot a copied app from `.e2e-tmp/` via `run-isolated-app.mjs`.
 * Cross-integration runs four canonical servers (dev, preview, hmr, vite-dev) against
 * `playground/kitchen-sink` with scoped artifact dirs per project.
 */
import path from 'node:path';
import type { PlaywrightTestProject } from '@playwright/test';
import { getDefaultWorkerCount } from './workers.ts';

export const crossIntegrationSourceDir = 'playground/kitchen-sink';
export const crossIntegrationSharedWorkspace = 'cross-integration-shared';
export const isolatedAppLauncher = 'node e2e/scripts/playwright/run-isolated-app.mjs';

export const crossIntegrationTestMatch = `${crossIntegrationSourceDir}/e2e/**/*.test.e2e.ts`;
export const crossIntegrationPreviewMatch = `${crossIntegrationSourceDir}/e2e/**/*.preview.test.e2e.ts`;
export const crossIntegrationHmrMatch = `${crossIntegrationSourceDir}/e2e/includes-hmr.test.e2e.ts`;
export const crossIntegrationViteHostMatch = `${crossIntegrationSourceDir}/e2e/vite-host-navigation.test.e2e.ts`;

const CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS = 90_000;
const CROSS_INTEGRATION_PREVIEW_TEST_TIMEOUT_MS = 60_000;

export type IsolatedProjectConfig = {
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

export type IsolatedFixtureModule = {
	block: 'cross-integration';
	projects: PlaywrightTestProject[];
	webServers: IsolatedFixtureWebServer[];
	/** Flat list of Playwright project names declared by this fixture. */
	batchProjects: string[];
};

export type IsolatedFixtureWebServer = {
	command: string;
	cwd: string;
	port?: number;
	url?: string;
	projects: string[];
	reuseExistingServer: boolean;
	stdout: 'pipe';
	stderr: 'pipe';
	env?: Record<string, string>;
};

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

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

export function createCrossIntegrationProjects(defaultWorkerCount: number): IsolatedProjectConfig[] {
	const devWorkerCount = 1;
	const hmrWorkerCount = 1;

	return [
		{
			name: 'cross-integration-dev-e2e',
			port: 4007,
			host: 'ecopages',
			runtime: 'bun',
			mode: 'dev',
			workspace: crossIntegrationSharedWorkspace,
			artifactScope: 'cross-integration-dev',
			testMatch: crossIntegrationTestMatch,
			testIgnore: [crossIntegrationPreviewMatch, crossIntegrationHmrMatch, crossIntegrationViteHostMatch],
			workers: devWorkerCount,
			timeout: CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS,
		},
		{
			name: 'cross-integration-preview-e2e',
			port: 4008,
			host: 'ecopages',
			runtime: 'bun',
			mode: 'preview',
			workspace: crossIntegrationSharedWorkspace,
			artifactScope: 'cross-integration-preview',
			testMatch: crossIntegrationPreviewMatch,
			workers: defaultWorkerCount,
			timeout: CROSS_INTEGRATION_PREVIEW_TEST_TIMEOUT_MS,
		},
		{
			name: 'cross-integration-hmr-e2e',
			port: 4016,
			host: 'ecopages',
			runtime: 'bun',
			mode: 'dev',
			workspace: 'cross-integration-hmr',
			artifactScope: 'cross-integration-hmr',
			testMatch: crossIntegrationHmrMatch,
			workers: hmrWorkerCount,
			timeout: CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS,
		},
		{
			name: 'cross-integration-vite-dev-e2e',
			port: 4012,
			host: 'vite',
			runtime: 'node',
			mode: 'dev',
			workspace: crossIntegrationSharedWorkspace,
			artifactScope: 'cross-integration-vite-dev',
			testMatch: crossIntegrationViteHostMatch,
			workers: devWorkerCount,
			timeout: CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS,
		},
	];
}

export function defineCrossIntegrationFixture(
	repoRootDir: string,
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): IsolatedFixtureModule {
	const defaultWorkerCount = getDefaultWorkerCount();
	const projectConfigs = createCrossIntegrationProjects(defaultWorkerCount);

	const projects = projectConfigs.map((project) => ({
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

	const webServers = projectConfigs.map((project) => ({
		command: buildIsolatedAppCommand({
			sourceDir: crossIntegrationSourceDir,
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
		reuseExistingServer: options.reuseExistingServer,
		stdout: 'pipe' as const,
		stderr: 'pipe' as const,
		...(project.workspace === crossIntegrationSharedWorkspace
			? { env: { ECOPAGES_MANAGE_ISOLATED_WORKSPACES: 'true' } }
			: {}),
	}));

	return {
		block: 'cross-integration',
		projects,
		webServers,
		batchProjects: projectConfigs.map((project) => project.name),
	};
}
