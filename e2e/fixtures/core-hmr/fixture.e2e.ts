import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import { ECOPAGES_CONFIG_FILE_ENV } from '@ecopages/core/config';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineFixture } from '../../playwright/define-fixture.ts';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirRelative = path.relative(process.cwd(), fixtureDir).split(path.sep).join('/');
const postcssConfig = 'eco.config.postcss.ts';

export default defineFixture(
	{
		block: 'core-hmr',
		dir: fixtureDir,
		projects: [
			{
				name: 'core-hmr-dev-e2e',
				mode: 'dev',
				testMatch: [`${fixtureDirRelative}/hmr.dev.test.e2e.ts`],
			},
			{
				name: 'core-hmr-postcss-dev-e2e',
				mode: 'dev',
				configFile: postcssConfig,
				testMatch: [`${fixtureDirRelative}/hmr.postcss.dev.test.e2e.ts`],
			},
			{
				name: 'core-hmr-static-e2e',
				mode: 'static',
				port: 43111,
				env: { [ECOPAGES_CONFIG_FILE_ENV]: path.join(fixtureDir, postcssConfig) },
				testIgnore: [`${fixtureDirRelative}/**/*.dev.test.e2e.ts`],
			},
		],
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
