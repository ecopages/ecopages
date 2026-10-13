import { devices } from '@playwright/test';
import { defineCrossIntegrationFixture } from '../../playwright/define-isolated-fixture.ts';

export default defineCrossIntegrationFixture(devices['Desktop Chrome']);
