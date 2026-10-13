/**
 * Kitchen-sink HMR only, on the per-worker app copy of `e2e/app-fixture.ts` because tests mutate source.
 *
 * Dev, parity, and preview run in-repo via `cross-integration-dev` and
 * `cross-integration-preview` fixtures.
 */
import type { PlaywrightTestProject } from '@playwright/test';
import type { AppOptions } from '../app-fixture.ts';

export const crossIntegrationSourceDir = 'playground/kitchen-sink';

export const crossIntegrationHmrMatch = `${crossIntegrationSourceDir}/e2e/*-hmr.test.e2e.ts`;

const CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS = 90_000;

export type IsolatedFixtureModule = {
	block: 'cross-integration';
	projects: PlaywrightTestProject<object, { appOptions: AppOptions | undefined }>[];
	batchProjects: string[];
};

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

/**
 * Kitchen-sink HMR Playwright project, run on Node.
 *
 * @remarks
 * Every worker runs the specs on its own copy of the app, so a spec edits files under `app.dir`. A file's
 * tests run in order on one worker; different files run on different workers.
 */
export function defineCrossIntegrationFixture(desktopChrome: DesktopChromeUse): IsolatedFixtureModule {
	const name = 'cross-integration-hmr-node-e2e';

	return {
		block: 'cross-integration',
		projects: [
			{
				name,
				testMatch: crossIntegrationHmrMatch,
				fullyParallel: false,
				timeout: CROSS_INTEGRATION_DEV_TEST_TIMEOUT_MS,
				use: {
					...desktopChrome,
					appOptions: {
						source: crossIntegrationSourceDir,
						env: { ECOPAGES_CROSS_INTEGRATION_E2E: 'true', ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS: '0' },
					},
				},
			},
		],
		batchProjects: [name],
	};
}

// Re-exported for kitchen-sink dev fixture testMatch strings.
export const crossIntegrationTestMatch = `${crossIntegrationSourceDir}/e2e/**/*.test.e2e.ts`;
export const crossIntegrationPreviewMatch = `${crossIntegrationSourceDir}/e2e/**/*.preview.test.e2e.ts`;
export const crossIntegrationParityMatch = `${crossIntegrationSourceDir}/e2e/parity.test.e2e.ts`;
