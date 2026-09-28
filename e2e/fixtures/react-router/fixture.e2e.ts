import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineFixture } from '../../playwright/define-fixture.ts';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirRelative = path.relative(process.cwd(), fixtureDir).split(path.sep).join('/');
const defaultTestMatch = `${fixtureDirRelative}/**/*.test.e2e.ts`;
const persistLayoutsEnv = { ECOPAGES_PERSIST_LAYOUTS: 'true' };

export default defineFixture(
	{
		block: 'react-router',
		dir: fixtureDir,
		projects: [
			{
				name: 'react-router-e2e',
				port: 4003,
				mode: 'static',
				testMatch: defaultTestMatch,
				testIgnore: [
					'**/persist-layouts.test.e2e.ts',
					'**/*hmr*.test.e2e.ts',
					'**/eco-layout-switch.test.e2e.ts',
				],
			},
			{
				name: 'react-router-persist-layouts-e2e',
				port: 4004,
				mode: 'static',
				env: persistLayoutsEnv,
				testMatch: `${fixtureDirRelative}/persist-layouts.test.e2e.ts`,
			},
			{
				name: 'react-router-persist-layouts-dev-e2e',
				port: 4006,
				mode: 'dev',
				env: persistLayoutsEnv,
				testMatch: [
					`${fixtureDirRelative}/persist-layouts-hmr.test.e2e.ts`,
					`${fixtureDirRelative}/eco-layout-switch.test.e2e.ts`,
				],
				workers: 1,
			},
		],
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
