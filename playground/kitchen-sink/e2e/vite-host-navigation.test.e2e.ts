import { expect, test } from '@playwright/test';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPath, trackRuntimeErrors } from './test-support';

/**
 * Focused regression for Vite-hosted kitchen-sink navigation.
 */
test.describe('Vite host navigation @content', () => {
	test('completes sequential document navigations across shell routes', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/');
		await expect(page.getByTestId(getPageTestId('/'))).toBeVisible();

		await gotoPath(page, '/images');
		await expect(page.getByTestId(getPageTestId('/images'))).toBeVisible();

		await gotoPath(page, '/transitions');
		await expect(page.getByTestId(getPageTestId('/transitions'))).toBeVisible();

		await gotoPath(page, '/latest');
		await expect(page.getByTestId(getPageTestId('/latest'))).toBeVisible();

		await gotoPath(page, '/catalog/semantic-html');
		await expect(page.getByTestId(getPageTestId('/catalog/semantic-html'))).toBeVisible();

		runtime.assertClean();
	});
});
