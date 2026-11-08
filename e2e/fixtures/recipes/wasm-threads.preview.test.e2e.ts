import { test } from '@playwright/test';
import { expectIsolatedWorkerCounts } from './wasm-threads.shared.ts';

test('under ecopages preview, the page is isolated and the Worker counts in shared memory', async ({ page }) => {
	await expectIsolatedWorkerCounts(page);
});
