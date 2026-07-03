/**
 * Isolated kitchen-sink HMR only — copies to `.e2e-tmp/` because tests mutate source.
 *
 * Dev, parity, and preview run in-repo via `cross-integration-dev` and
 * `cross-integration-preview` fixtures.
 */
import path from 'node:path';
import type { PlaywrightTestProject } from '@playwright/test';
import { getIsolatedDevServerReadySignal } from './isolated-dev-server-ready.ts';

export const crossIntegrationSourceDir = 'playground/kitchen-sink';
export const isolatedAppLauncher = 'node e2e/scripts/playwright/run-isolated-app.mjs';

export const crossIntegrationHmrMatch = `${crossIntegrationSourceDir}/e2e/includes-hmr.test.e2e.ts`;

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
	const project = {
		name: 'cross-integration-hmr-e2e',
		port: 4016,
		host: 'ecopages' as const,
		runtime: 'bun' as const,
		workspace: 'cross-integration-hmr',
		artifactScope: 'cross-integration-hmr',
		testMatch: crossIntegrationHmrMatch,
	};

	return {
		block: 'cross-integration',
		projects: [
			{
				name: project.name,
				testMatch: project.testMatch,
				workers: 1,
				timeout: CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS,
				metadata: {
					artifactScope: project.artifactScope,
					isolatedAppDir: path.join(repoRootDir, '.e2e-tmp', project.workspace),
				},
				use: {
					...desktopChrome,
					baseURL: `http://localhost:${project.port}`,
				},
			},
		],
		webServers: [
			{
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
				...getIsolatedDevServerReadySignal(project.host, project.port),
				projects: [project.name],
				reuseExistingServer: options.reuseExistingServer,
				stdout: 'pipe',
				stderr: 'pipe',
			},
		],
		batchProjects: [project.name],
	};
}

// Re-exported for kitchen-sink dev fixture testMatch strings.
export const crossIntegrationTestMatch = `${crossIntegrationSourceDir}/e2e/**/*.test.e2e.ts`;
export const crossIntegrationPreviewMatch = `${crossIntegrationSourceDir}/e2e/**/*.preview.test.e2e.ts`;
export const crossIntegrationParityMatch = `${crossIntegrationSourceDir}/e2e/parity.test.e2e.ts`;
