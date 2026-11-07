import { test } from '../../app-fixture.ts';
import { expectIsolatedWorkerCounts } from './wasm-threads.shared.ts';

test('in development, the page is isolated and the Worker counts in shared memory', async ({ page }) => {
	await expectIsolatedWorkerCounts(page);
});
