import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineFixture } from '../../playwright/define-fixture.ts';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

export default defineFixture(
	{
		block: 'html-pages',
		dir: fixtureDir,
		projects: [
			{
				name: 'html-pages-e2e',
				port: 4620,
				mode: 'static',
				testIgnore: [`${fixtureDir}/**/*.dev.test.e2e.ts`],
			},
			{
				name: 'html-pages-dev-e2e',
				port: 4622,
				mode: 'dev',
				testMatch: [`${fixtureDir}/shared-module.test.e2e.ts`],
			},
			{
				name: 'html-pages-classic-script-dev-e2e',
				port: 4623,
				mode: 'dev',
				testMatch: [`${fixtureDir}/**/*.dev.test.e2e.ts`],
			},
		],
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
