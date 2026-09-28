import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import { ECOPAGES_CONFIG_FILE_ENV } from '@ecopages/core/config';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineFixture } from '../../playwright/define-fixture.ts';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const postcssConfigPath = path.join(fixtureDir, 'eco.config.postcss.ts');
const postcssEnv = { [ECOPAGES_CONFIG_FILE_ENV]: postcssConfigPath };

export default defineFixture(
	{
		block: 'core-hmr',
		dir: fixtureDir,
		devPort: 43110,
		postcssDevPort: 43112,
		staticPort: 43111,
		postcssDevEnv: postcssEnv,
		staticEnv: postcssEnv,
		devWorkers: 1,
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
