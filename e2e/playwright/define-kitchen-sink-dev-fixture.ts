/**
 * Kitchen-sink dev + parity e2e on the per-worker app copy of `e2e/app-fixture.ts`.
 *
 * Every worker of these projects runs its own `ecopages dev` on its own copy, so the
 * projects can run side by side. HMR stays in `define-isolated-fixture.ts`.
 */
import type { PlaywrightTestProject } from '@playwright/test';
import type { AppProject, FixtureModule } from './define-fixture.ts';
import {
	crossIntegrationHmrMatch,
	crossIntegrationParityMatch,
	crossIntegrationPreviewMatch,
	crossIntegrationSourceDir,
	crossIntegrationTestMatch,
} from './define-isolated-fixture.ts';

const DEV_TEST_TIMEOUT_MS = 90_000;

/**
 * Longest the Bun parity server may take to print its ready line.
 *
 * @remarks
 * The watcher's initial crawl is about 78x slower on Bun than on Node, so dev init takes about 30 s
 * there against under 2 s on Node. The ceiling leaves room for a slow CI runner and fails a run
 * whose init time regresses, instead of letting it pass inside the fixture's much longer default.
 */
const BUN_DEV_INIT_CEILING_MS = 45_000;

type DevVariant = {
	name: string;
	runtime: 'bun' | 'node';
	readyTimeoutMs?: number;
	testMatch: string;
	testIgnore?: string[];
};

const devVariants: DevVariant[] = [
	{
		name: 'cross-integration-dev-e2e',
		runtime: 'node',
		testMatch: crossIntegrationTestMatch,
		testIgnore: [crossIntegrationPreviewMatch, crossIntegrationHmrMatch],
	},
	{
		name: 'cross-integration-bun-parity-e2e',
		runtime: 'bun',
		readyTimeoutMs: BUN_DEV_INIT_CEILING_MS,
		testMatch: crossIntegrationParityMatch,
	},
];

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

export function defineKitchenSinkDevFixture(desktopChrome: DesktopChromeUse): FixtureModule {
	const projects: AppProject[] = devVariants.map((variant) => ({
		name: variant.name,
		testMatch: variant.testMatch,
		testIgnore: variant.testIgnore,
		timeout: DEV_TEST_TIMEOUT_MS,
		use: {
			...desktopChrome,
			appOptions: {
				source: crossIntegrationSourceDir,
				runtime: variant.runtime,
				readyTimeoutMs: variant.readyTimeoutMs,
				env: { ECOPAGES_CROSS_INTEGRATION_E2E: 'true' },
			},
		},
	}));

	return { block: 'cross-integration-dev', projects, webServers: [] };
}
