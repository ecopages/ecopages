/**
 * Kitchen-sink dev + parity e2e — in-repo, no .e2e-tmp copy.
 *
 * One Playwright process can run all four cells: each server uses a scoped
 * .eco-${scope} dir and its own port. HMR stays in the isolated fixture.
 */
import type { PlaywrightTestProject } from '@playwright/test';
import { getIsolatedDevServerReadySignal } from './isolated-dev-server-ready.ts';
import type { FixtureModule, FixtureWebServer } from './define-fixture.ts';
import {
	crossIntegrationHmrMatch,
	crossIntegrationParityMatch,
	crossIntegrationPreviewMatch,
	crossIntegrationSourceDir,
	crossIntegrationTestMatch,
} from './define-isolated-fixture.ts';

const devLauncher = 'node e2e/scripts/playwright/start-kitchen-sink-dev-server.mjs';
const DEV_TEST_TIMEOUT_MS = 90_000;

type DevVariant = {
	name: string;
	port: number;
	host: 'ecopages' | 'vite';
	runtime: 'bun' | 'node';
	artifactScope: string;
	testMatch: string;
	testIgnore?: string[];
};

const devVariants: DevVariant[] = [
	{
		name: 'cross-integration-dev-e2e',
		port: 4007,
		host: 'ecopages',
		runtime: 'node',
		artifactScope: 'cross-integration-dev',
		testMatch: crossIntegrationTestMatch,
		testIgnore: [crossIntegrationPreviewMatch, crossIntegrationHmrMatch],
	},
	{
		name: 'cross-integration-bun-parity-e2e',
		port: 4013,
		host: 'ecopages',
		runtime: 'bun',
		artifactScope: 'cross-integration-bun-parity',
		testMatch: crossIntegrationParityMatch,
	},
	{
		name: 'cross-integration-vite-node-parity-e2e',
		port: 4012,
		host: 'vite',
		runtime: 'node',
		artifactScope: 'cross-integration-vite-node-parity',
		testMatch: crossIntegrationParityMatch,
	},
	{
		name: 'cross-integration-vite-bun-parity-e2e',
		port: 4014,
		host: 'vite',
		runtime: 'bun',
		artifactScope: 'cross-integration-vite-bun-parity',
		testMatch: crossIntegrationParityMatch,
	},
];

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

function buildDevServerCommand(variant: DevVariant): string {
	return [
		`ECOPAGES_PORT=${variant.port}`,
		`ECOPAGES_DEV_HOST=${variant.host}`,
		`ECOPAGES_DEV_RUNTIME=${variant.runtime}`,
		`ECOPAGES_E2E_ARTIFACT_SCOPE=${variant.artifactScope}`,
		devLauncher,
	].join(' ');
}

export function defineKitchenSinkDevFixture(
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): FixtureModule {
	const projects: PlaywrightTestProject[] = devVariants.map((variant) => ({
		name: variant.name,
		testMatch: variant.testMatch,
		testIgnore: variant.testIgnore,
		workers: 1,
		timeout: DEV_TEST_TIMEOUT_MS,
		use: {
			...desktopChrome,
			baseURL: `http://localhost:${variant.port}`,
		},
	}));

	const webServers: FixtureWebServer[] = devVariants.map((variant) => ({
		command: buildDevServerCommand(variant),
		cwd: '.',
		...getIsolatedDevServerReadySignal(variant.host, variant.port),
		projects: [variant.name],
		reuseExistingServer: options.reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	}));

	return {
		definition: {
			block: 'cross-integration-dev',
			testMatch: `${crossIntegrationSourceDir}/e2e/**/*.test.e2e.ts`,
			port: devVariants[0].port,
			command: devLauncher,
			cwd: '.',
		},
		projects,
		webServers,
		batchProjects: devVariants.map((variant) => variant.name),
	};
}
