import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { integrationMatrixTestIds } from '../src/data/integration-matrix';
import {
	assertAllCountersInteractivity,
	gotoPath,
	incrementCounter,
	recoverToPath,
	trackRuntimeErrors,
} from './helpers';
import { fireRapidLinkClicks, settleAfterRapidHops } from './rapid-navigation-sequences';

async function waitForReactPageHydration(page: Page) {
	await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, {
		timeout: 10000,
	});
}

async function assertReactPageBootstrapHasNoBareCoreImports(page: Page) {
	const bootstrapSrc = await page
		.locator('script[data-eco-page-bootstrap="react-router"]')
		.first()
		.getAttribute('src');
	expect(bootstrapSrc).toBeTruthy();

	const response = await page.request.get(bootstrapSrc!);
	expect(response.ok()).toBe(true);
	const body = await response.text();
	expect(body).not.toMatch(/from\s+["']@ecopages\/core\//);
	expect(body).not.toMatch(/from\s+["']@ecopages\/react\/layout-compose["']/);
}

test.describe('React routes interactivity @content', () => {
	test('cold-loads React MDX and increments the page counter', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/react-content');
		await expect(page.getByTestId('page-react-content')).toBeVisible();
		await waitForReactPageHydration(page);
		await assertReactPageBootstrapHasNoBareCoreImports(page);

		const root = page.getByTestId('page-react-content');
		await expect(root.locator('[data-react-value]')).toHaveText('0');
		await incrementCounter(root.locator('[data-react-inc]'), root.locator('[data-react-value]'), '1');
		await expect(root.locator('lit-counter')).toHaveCount(1);

		runtime.assertClean();
	});

	test('keeps React MDX counters interactive after browser-router and react-router handoffs', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/docs');
		await page.getByTestId('primary-link-react-content').click();
		await expect(page.getByTestId('page-react-content')).toBeVisible({ timeout: 15_000 });
		await waitForReactPageHydration(page);
		await incrementCounter(
			page.getByTestId('page-react-content').locator('[data-react-inc]'),
			page.getByTestId('page-react-content').locator('[data-react-value]'),
			'1',
		);

		await page.getByTestId('route-link-react-lab').click();
		await expect(page.getByRole('heading', { name: 'React Page Route' })).toBeVisible({ timeout: 15_000 });
		await waitForReactPageHydration(page);

		await page.getByTestId('primary-link-react-content').click();
		await expect(page.getByTestId('page-react-content')).toBeVisible({ timeout: 15_000 });
		await waitForReactPageHydration(page);
		await incrementCounter(
			page.getByTestId('page-react-content').locator('[data-react-inc]'),
			page.getByTestId('page-react-content').locator('[data-react-value]'),
			'1',
		);

		runtime.assertClean();
	});

	test('keeps the React-shell matrix counter interactive after cross-runtime hops', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const priorHops = ['/docs', '/react-lab', '/react-content', '/integration-matrix/lit-entry'];

		await gotoPath(page, '/');
		await fireRapidLinkClicks(page, priorHops);
		await settleAfterRapidHops(page);
		await recoverToPath(page, '/integration-matrix/react-entry');

		await expect(page.getByTestId(integrationMatrixTestIds.hostShellStack)).toBeVisible({ timeout: 15_000 });
		await assertAllCountersInteractivity(page.getByTestId('integration-matrix-shell-counters-react'));

		runtime.assertClean();
	});

	test('cold-loads Kita-hosted React islands without prior React page activation', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/integration-matrix/react-entry');
		await expect(page.getByTestId(integrationMatrixTestIds.hostShellStack)).toBeVisible({ timeout: 15_000 });

		const reactVendor = await page.request.get('/assets/vendors/react.development.js');
		const reactDomVendor = await page.request.get('/assets/vendors/react-dom.development.js');
		expect(reactVendor.ok()).toBe(true);
		expect(reactDomVendor.ok()).toBe(true);

		await assertAllCountersInteractivity(page.getByTestId('integration-matrix-shell-counters-react'));

		runtime.assertClean();
	});
});
