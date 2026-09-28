import { devices } from '@playwright/test';
import { shouldReuseExistingTestServers } from '../../playwright/config-env.ts';
import { defineKitchenSinkPreviewFixture } from '../../playwright/define-kitchen-sink-preview-fixture.ts';

export default defineKitchenSinkPreviewFixture(devices['Desktop Chrome'], {
	reuseExistingServer: shouldReuseExistingTestServers(),
});
