/**
 * Kitchen-sink preview e2e — in-repo dist, no isolated workspace copy.
 *
 * Build once via `pnpm build:e2e:kitchen-sink` before Playwright. The Bun preview
 * serves `dist-preview-bun` from `ecopages build --runtime bun`. The Node preview
 * serves `dist/` from `ecopages build --runtime node`. Each webServer only serves.
 */
import type { PlaywrightTestProject } from '@playwright/test';
import { getEcopagesServerReadySignal } from './isolated-dev-server-ready.ts';
import { getDefaultWorkerCount } from './workers.ts';
import type { FixtureModule, FixtureWebServer } from './define-fixture.ts';

export const kitchenSinkPreviewTestMatch = 'playground/kitchen-sink/e2e/**/*.preview.test.e2e.ts';

const previewLauncher = 'node e2e/scripts/playwright/start-kitchen-sink-preview-server.mjs';

const previewVariants = [
	{ name: 'cross-integration-preview-e2e', port: 4008, runtime: 'bun', artifactScope: 'preview-bun' },
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
		command: `NODE_ENV=production ECOPAGES_PORT=${variant.port} ECOPAGES_PREVIEW_RUNTIME=${variant.runtime}${
			'artifactScope' in variant ? ` ECOPAGES_E2E_ARTIFACT_SCOPE=${variant.artifactScope}` : ''
		} ${previewLauncher}`,
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
