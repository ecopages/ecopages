/**
 * Playwright entrypoint. Project and web-server tables live in `e2e/playwright/`.
 * Batch orchestration and env vars: `e2e/scripts/playwright/run-e2e.mjs`, `e2e/README.md`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import {
	getSelectedPlaywrightProjects,
	includeWebServerForProjects,
	shouldReuseExistingTestServers,
} from './e2e/playwright/config-env';
import { createFixturePlaywrightProjects } from './e2e/playwright/fixture-projects';
import { createFixtureWebServers } from './e2e/playwright/fixture-web-servers';
import {
	createKitchenSinkPlaywrightProjects,
	createKitchenSinkProjects,
	createKitchenSinkWebServers,
} from './e2e/playwright/kitchen-sink';
import { getWebServerTimeout } from './e2e/playwright/web-server-timeouts';
import { getDefaultWorkerCount } from './e2e/playwright/workers';
import { configurePlaywrightColorEnv } from './e2e/playwright/playwright-color-env.mjs';

configurePlaywrightColorEnv(process.env);

const repoRootDir = path.dirname(fileURLToPath(import.meta.url));
const desktopChrome = devices['Desktop Chrome'];
const defaultWorkerCount = getDefaultWorkerCount();
const reuseExistingServer = shouldReuseExistingTestServers();
const selectedProjects = getSelectedPlaywrightProjects();
const kitchenSinkProjects = createKitchenSinkProjects(defaultWorkerCount);

const webServers = [
	...createFixtureWebServers(reuseExistingServer),
	...createKitchenSinkWebServers(kitchenSinkProjects, reuseExistingServer),
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
		...createFixturePlaywrightProjects(desktopChrome),
		...createKitchenSinkPlaywrightProjects(repoRootDir, kitchenSinkProjects, desktopChrome),
	],
	webServer: webServers
		.filter((server) => includeWebServerForProjects(selectedProjects, server.projects))
		.map((server) => ({
			...server,
			timeout: getWebServerTimeout(server),
		})),
});
