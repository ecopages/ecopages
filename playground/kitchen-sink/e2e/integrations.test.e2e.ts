import { expect, test } from '@playwright/test';
import {
	assertCounterInteractivity,
	clickHrefAndWait,
	getSectionByText,
	gotoAndWait,
	incrementCounter,
	trackRuntimeErrors,
} from './helpers';

test.describe('Kitchen Sink Playground Integrations', () => {
	test('renders the full integration matrix and cross-integration children', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/integration-matrix');

		await expect(
			page.getByRole('heading', { name: 'Render every integration through every other one.' }),
		).toBeVisible();
		await expect(page.locator('[data-react-shell="kita-react-child"]').first()).toBeVisible();
		await expect(page.locator('[data-cross-child="lit-root"]')).toHaveText('lit-root-child');
		await expect(page.locator('[data-react-shell="react-root"] [data-react-shell-child]')).toHaveText(
			'react-root-child',
		);
		await expect(page.locator('[data-kita-shell="kita-root"] [data-lit-shell="kita-lit-child"]')).toBeVisible();
		await expect(page.locator('[data-lit-shell="lit-root"] [data-kita-shell="lit-kita-child"]')).toBeVisible();

		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));
		runtime.assertClean();
	});

	test('keeps all integration counters interactive across repeated browser-router hops', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/integration-matrix');
		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));

		await clickHrefAndWait(page, '/integration-matrix/lit-entry');

		await expect(
			page.getByRole('heading', { name: 'The page entry can change while the matrix stays shared.' }),
		).toBeVisible();
		await expect(page.locator('[data-lit-shell="lit-entry-root"]')).toBeVisible();
		await expect(page.locator('[data-kita-shell="lit-entry-kita-child"]')).toBeVisible();
		await expect(page.locator('[data-react-shell="lit-entry-react-child"]').first()).toBeVisible();
		await expect(page.locator('[data-react-shell="lit-entry-react-child"] [data-react-shell-child]')).toHaveText(
			'lit-entry-child',
		);

		await assertCounterInteractivity(getSectionByText(page, 'Counters'));

		await clickHrefAndWait(page, '/integration-matrix');
		await expect(
			page.getByRole('heading', { name: 'Render every integration through every other one.' }),
		).toBeVisible();
		await assertCounterInteractivity(getSectionByText(page, 'Counters across integrations'));
		runtime.assertClean();
	});

	test('keeps React route handoff stable across a full React and non-React tour', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');
		await expect(page.locator('[data-lit-value]').first()).toHaveText('1');
		await incrementCounter(page.locator('[data-lit-inc]').first(), page.locator('[data-lit-value]').first(), '2');

		await clickHrefAndWait(page, '/react-lab');
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		await clickHrefAndWait(page, '/react-notes');
		await expect(page.getByRole('heading', { name: 'React Notes' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(page.locator('[data-react-inc]'), page.locator('[data-react-value]'), '1');

		await clickHrefAndWait(page, '/docs');
		await expect(page.getByRole('heading', { name: 'MDX Route' })).toBeVisible();

		await clickHrefAndWait(page, '/react-content');
		await expect(page.getByRole('heading', { name: 'React MDX' })).toBeVisible();
		await expect(page.locator('[data-react-value]')).toHaveText('0');
		await expect(page.locator('[data-lit-value]').first()).toHaveText('1');
		runtime.assertClean();
	});
});
