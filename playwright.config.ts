/**
 * Playwright entrypoint. Fixtures self-describe in e2e/fixtures/<block>/fixture.e2e.ts.
 * Full suite: package.json scripts test:e2e:static, test:e2e:dev, test:e2e:kitchen-sink.
 */
import './e2e/playwright/strip-inherited-pwdebug.mjs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { getSelectedPlaywrightProjects, includeWebServerForProjects } from './e2e/playwright/config-env';
import { loadCapabilityFixtures, loadIsolatedFixtures } from './e2e/playwright/discover-fixtures';
import { getWebServerTimeout } from './e2e/playwright/web-server-timeouts';
import { getDefaultWorkerCount } from './e2e/playwright/workers';
import { configurePlaywrightColorEnv } from './e2e/playwright/playwright-color-env.mjs';

configurePlaywrightColorEnv(process.env);

const defaultWorkerCount = getDefaultWorkerCount();
const selectedProjects = getSelectedPlaywrightProjects();
const capabilityFixtures = loadCapabilityFixtures();
const isolatedFixtures = loadIsolatedFixtures();

const webServers = [
	...capabilityFixtures.flatMap((fixture) => fixture.webServers),
	...isolatedFixtures.flatMap((fixture) => fixture.webServers),
];

const projects = [
	...capabilityFixtures.flatMap((fixture) => fixture.projects),
	...isolatedFixtures.flatMap((fixture) => fixture.projects),
];

const assertPortsFreeScript = path.join(process.cwd(), 'e2e/scripts/playwright/assert-ports-free.mjs');

/**
 * Prefixes a web server command with a check that the ports its projects test against are free.
 *
 * @remarks
 * Ports come from each project's `baseURL`, the address the tests request. Skipped when
 * `reuseExistingServer` is set, since a running server is then expected. See
 * `e2e/scripts/playwright/assert-ports-free.mjs`.
 */
function withPortCheck(server: { command: string; projects: string[]; reuseExistingServer: boolean }): string {
	if (server.reuseExistingServer) {
		return server.command;
	}

	const ports = new Set(
		projects
			.filter((project) => project.name && server.projects.includes(project.name) && project.use?.baseURL)
			.map((project) => new URL(String(project.use?.baseURL)).port),
	);

	return ports.size === 0
		? server.command
		: `node ${JSON.stringify(assertPortsFreeScript)} ${[...ports].join(' ')} && ${server.command}`;
}

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	workers: defaultWorkerCount,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		/**
		 * Keep default e2e runs on chromium-headless-shell (no visible Chrome.app).
		 *
		 * @remarks
		 * Playwright 1.57+ ships Chrome for Testing as the headed Chromium binary.
		 * Inherited `PWDEBUG` also forces headed inspector mode; e2e launchers strip
		 * it in `createPlaywrightSubprocessEnv`. `pnpm test:e2e:ui` and `--headed`
		 * still override this for local debugging.
		 */
		headless: true,
		trace: 'on-first-retry',
	},
	projects,
	webServer: webServers
		.filter((server) => includeWebServerForProjects(selectedProjects, server.projects))
		.map((server) => ({
			...server,
			command: withPortCheck(server),
			timeout: getWebServerTimeout(server),
		})),
});
