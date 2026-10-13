import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineKitchenSinkDevFixture } from '../../playwright/define-kitchen-sink-dev-fixture.ts';

export default defineKitchenSinkDevFixture(devices['Desktop Chrome'], {
	reuseExistingServer: shouldReuseExistingTestServers(),
});
