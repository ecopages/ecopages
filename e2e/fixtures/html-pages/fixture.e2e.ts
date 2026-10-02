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
				port: 43120,
				mode: 'static',
			},
		],
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
