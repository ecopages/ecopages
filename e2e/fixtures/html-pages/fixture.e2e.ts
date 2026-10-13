import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineFixture } from '../../playwright/define-fixture.ts';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirRelative = path.relative(process.cwd(), fixtureDir).split(path.sep).join('/');

export default defineFixture(
	{
		block: 'html-pages',
		dir: fixtureDir,
		projects: [
			{
				name: 'html-pages-e2e',
				mode: 'static',
				port: 4620,
				testIgnore: [`${fixtureDirRelative}/**/*.dev.test.e2e.ts`],
			},
			{
				name: 'html-pages-dev-e2e',
				mode: 'dev',
				testMatch: [`${fixtureDirRelative}/**/*.dev.test.e2e.ts`],
			},
		],
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
