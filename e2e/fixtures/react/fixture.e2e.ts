import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineExternalFixture } from '../../playwright/define-fixture.ts';
import { reactPlaygroundE2ePort } from '../../playwright/ports.ts';

export default defineExternalFixture(
	{
		block: 'react',
		testMatch: 'e2e/fixtures/react/**/*.test.e2e.ts',
		port: reactPlaygroundE2ePort,
		command: `ECOPAGES_PORT=${reactPlaygroundE2ePort} pnpm --filter @ecopages/playground-react run dev`,
		cwd: '.',
		projectName: 'react-dev-e2e',
	},
	devices['Desktop Chrome'],
	{ reuseExistingServer: shouldReuseExistingTestServers() },
);
