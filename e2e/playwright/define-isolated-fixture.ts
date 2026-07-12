/**
 * Isolated kitchen-sink HMR only — copies to `.e2e-tmp/` because tests mutate source.
 *
 * Dev, parity, and preview run in-repo via `cross-integration-dev` and
 * `cross-integration-preview` fixtures.
 */
import path from 'node:path';
import type { PlaywrightTestProject } from '@playwright/test';
import { getEcopagesServerReadySignal } from './isolated-dev-server-ready.ts';

export const crossIntegrationSourceDir = 'playground/kitchen-sink';
export const isolatedAppLauncher = 'node e2e/scripts/playwright/run-isolated-app.mjs';

export const crossIntegrationHmrMatch = `${crossIntegrationSourceDir}/e2e/*-hmr.test.e2e.ts`;

const CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS = 90_000;

export type IsolatedFixtureModule = {
	block: 'cross-integration';
	projects: PlaywrightTestProject[];
	webServers: IsolatedFixtureWebServer[];
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
	mode: 'dev';
	port: number;
	runtime: 'bun' | 'node';
	workspace: string;
	artifactScope: string;
}): string {
	return `${isolatedAppLauncher} --sourceDir ${options.sourceDir} --workspace ${options.workspace} --artifactScope ${options.artifactScope} --host ${options.host} --runtime ${options.runtime} --mode ${options.mode} --port ${options.port}`;
}

export function defineCrossIntegrationFixture(
	repoRootDir: string,
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): IsolatedFixtureModule {
	const hmrProjects = [
		{
			name: 'cross-integration-hmr-e2e',
			port: 4016,
			host: 'ecopages' as const,
			runtime: 'bun' as const,
			workspace: 'cross-integration-hmr',
			artifactScope: 'cross-integration-hmr',
		},
		{
			name: 'cross-integration-hmr-node-e2e',
			port: 4017,
			host: 'ecopages' as const,
			runtime: 'node' as const,
			workspace: 'cross-integration-hmr-node',
			artifactScope: 'cross-integration-hmr-node',
		},
		{
			name: 'cross-integration-hmr-vite-e2e',
			port: 4018,
			host: 'vite' as const,
			runtime: 'node' as const,
			workspace: 'cross-integration-hmr-vite',
			artifactScope: 'cross-integration-hmr-vite',
		},
	];

	return {
		block: 'cross-integration',
		projects: hmrProjects.map((project) => ({
			name: project.name,
			testMatch: crossIntegrationHmrMatch,
			workers: 1,
			fullyParallel: false,
			timeout: CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS,
			metadata: {
				artifactScope: project.artifactScope,
				isolatedAppDir: path.join(repoRootDir, '.e2e-tmp', project.workspace),
			},
			use: {
				...desktopChrome,
				baseURL: `http://localhost:${project.port}`,
			},
		})),
		webServers: hmrProjects.map((project) => ({
			command: buildIsolatedAppCommand({
				sourceDir: crossIntegrationSourceDir,
				workspace: project.workspace,
				artifactScope: project.artifactScope,
				host: project.host,
				runtime: project.runtime,
				mode: 'dev',
				port: project.port,
			}),
			cwd: '.',
			...getEcopagesServerReadySignal(),
			projects: [project.name],
			reuseExistingServer: options.reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		})),
		batchProjects: hmrProjects.map((project) => project.name),
	};
}

// Re-exported for kitchen-sink dev fixture testMatch strings.
export const crossIntegrationTestMatch = `${crossIntegrationSourceDir}/e2e/**/*.test.e2e.ts`;
export const crossIntegrationPreviewMatch = `${crossIntegrationSourceDir}/e2e/**/*.preview.test.e2e.ts`;
export const crossIntegrationParityMatch = `${crossIntegrationSourceDir}/e2e/parity.test.e2e.ts`;
