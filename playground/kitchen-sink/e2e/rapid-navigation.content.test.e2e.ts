import { expect, test } from '@playwright/test';
import { kitchenSinkShellTestId } from '../src/data/primary-links';
import { fireRapidLinkClicks, randomHopSequence, settleAfterRapidHops } from './rapid-navigation-sequences';
import { gotoPath, trackRuntimeErrors } from './test-support';

test.describe('Rapid navigation @content', () => {
	test('survives a random sequence of primary-nav hops without breaking the shell @content', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const hops = randomHopSequence(14);

		await gotoPath(page, '/');
		await fireRapidLinkClicks(page, hops);
		await settleAfterRapidHops(page);
		await expect(page.getByTestId(kitchenSinkShellTestId)).toBeVisible({ timeout: 15_000 });
		runtime.assertClean();
	});

	test('survives rapid hops across React and Kita routes without breaking the shell @content', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const hops = ['/docs', '/react-lab', '/react-content', '/postcss', '/react-server-files', '/docs'];

		await gotoPath(page, '/');
		await fireRapidLinkClicks(page, hops);
		await settleAfterRapidHops(page);
		await expect(page.getByTestId(kitchenSinkShellTestId)).toBeVisible({ timeout: 15_000 });
		runtime.assertClean();
	});
});
