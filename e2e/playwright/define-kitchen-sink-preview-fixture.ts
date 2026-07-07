/**
 * Kitchen-sink preview e2e — in-repo dist, no isolated workspace copy.
 *
 * Build once via `pnpm build:e2e:kitchen-sink` before Playwright. Each webServer
 * only serves the existing static export (bun or node runtime).
 */
import type { PlaywrightTestProject } from '@playwright/test';
import { getEcopagesServerReadySignal } from './isolated-dev-server-ready.ts';
import { getDefaultWorkerCount } from './workers.ts';
import type { FixtureModule, FixtureWebServer } from './define-fixture.ts';

export const kitchenSinkPreviewTestMatch = 'playground/kitchen-sink/e2e/**/*.preview.test.e2e.ts';

const previewLauncher = 'node e2e/scripts/playwright/start-kitchen-sink-preview-server.mjs';

const previewVariants = [
	{ name: 'cross-integration-preview-e2e', port: 4008, runtime: 'bun' },
	{ name: 'cross-integration-node-preview-e2e', port: 4011, runtime: 'node' },
] as const;

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

export function defineKitchenSinkPreviewFixture(
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): FixtureModule {
	const defaultWorkerCount = getDefaultWorkerCount();

	const projects: PlaywrightTestProject[] = previewVariants.map((variant) => ({
		name: variant.name,
		testMatch: kitchenSinkPreviewTestMatch,
		workers: defaultWorkerCount,
		timeout: 60_000,
		use: {
			...desktopChrome,
			baseURL: `http://localhost:${variant.port}`,
		},
	}));

	const webServers: FixtureWebServer[] = previewVariants.map((variant) => ({
		command: `NODE_ENV=production ECOPAGES_PORT=${variant.port} ECOPAGES_PREVIEW_RUNTIME=${variant.runtime} ${previewLauncher}`,
		cwd: '.',
		...getEcopagesServerReadySignal(),
		projects: [variant.name],
		reuseExistingServer: options.reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
	}));

	return {
		definition: {
			block: 'cross-integration-preview',
			testMatch: kitchenSinkPreviewTestMatch,
			port: previewVariants[0].port,
			command: previewLauncher,
			cwd: '.',
		},
		projects,
		webServers,
		batchProjects: previewVariants.map((variant) => variant.name),
	};
}
