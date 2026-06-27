import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineCrossIntegrationFixture } from '../../playwright/define-isolated-fixture.ts';

const repoRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export default defineCrossIntegrationFixture(repoRootDir, devices['Desktop Chrome'], {
	reuseExistingServer: shouldReuseExistingTestServers(),
});
