import { test } from '@playwright/test';
import { broadTraversalSequence, crossTechnologySequences, fireRapidLinkClicks } from './rapid-navigation-sequences';
import { gotoPath, trackRuntimeErrors } from './test-support';

test.describe('Browser-router stress @stress', () => {
	test('survives a full route traversal without a crash @stress', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, broadTraversalSequence[0] ?? '/');

		await fireRapidLinkClicks(page, broadTraversalSequence.slice(1));

		runtime.assertClean();
	});

	for (let index = 0; index < crossTechnologySequences.length; index += 1) {
		test(`survives cross-technology navigation sequence ${index + 1} @stress`, async ({ page }) => {
			const runtime = trackRuntimeErrors(page);
			const sequence = crossTechnologySequences[index];

			await gotoPath(page, sequence[0]);

			await fireRapidLinkClicks(page, sequence.slice(1));

			runtime.assertClean();
		});
	}
});
