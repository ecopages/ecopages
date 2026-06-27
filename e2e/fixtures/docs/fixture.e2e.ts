import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineExternalFixture } from '../../playwright/define-fixture.ts';

export default defineExternalFixture(
	{
		block: 'docs',
		testMatch: 'e2e/fixtures/docs/**/*.test.e2e.ts',
		port: 4009,
		command: 'NODE_ENV=production ECOPAGES_PORT=4009 node e2e/scripts/playwright/start-docs-e2e-server.mjs',
		cwd: '.',
		projectName: 'docs-e2e',
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
