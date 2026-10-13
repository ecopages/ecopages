import { devices } from '@playwright/test';
import { defineKitchenSinkDevFixture } from '../../playwright/define-kitchen-sink-dev-fixture.ts';

export default defineKitchenSinkDevFixture(devices['Desktop Chrome']);
