/**
 * Playwright entrypoint. Capability fixtures self-describe via `e2e/fixtures/<block>/fixture.e2e.ts`.
 * Batch orchestration: `e2e/scripts/playwright/run-e2e.ts`, `e2e/README.md`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import {
	getSelectedPlaywrightProjects,
	includeWebServerForProjects,
	shouldReuseExistingTestServers,
} from './e2e/playwright/config-env';
import { loadCapabilityFixtures, loadIsolatedFixtures } from './e2e/playwright/discover-fixtures';
import { getWebServerTimeout } from './e2e/playwright/web-server-timeouts';
import { getDefaultWorkerCount } from './e2e/playwright/workers';
import { configurePlaywrightColorEnv } from './e2e/playwright/playwright-color-env.mjs';

configurePlaywrightColorEnv(process.env);

const repoRootDir = path.dirname(fileURLToPath(import.meta.url));
const desktopChrome = devices['Desktop Chrome'];
const defaultWorkerCount = getDefaultWorkerCount();
const reuseExistingServer = shouldReuseExistingTestServers();
const selectedProjects = getSelectedPlaywrightProjects();
const capabilityFixtures = loadCapabilityFixtures();
const isolatedFixtures = loadIsolatedFixtures();

const webServers = [
	...capabilityFixtures.flatMap((fixture) => fixture.webServers),
	...isolatedFixtures.flatMap((fixture) => fixture.webServers),
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
		...capabilityFixtures.flatMap((fixture) => fixture.projects),
		...isolatedFixtures.flatMap((fixture) => fixture.projects),
	],
	webServer: webServers
		.filter((server) => includeWebServerForProjects(selectedProjects, server.projects))
		.map((server) => ({
			...server,
			timeout: getWebServerTimeout(server),
		})),
});
