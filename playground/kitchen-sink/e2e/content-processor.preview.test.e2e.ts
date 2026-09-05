import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { gotoPath, incrementCounter, trackRuntimeErrors } from './helpers';

async function waitForReactPageHydration(page: Page) {
	await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, {
		timeout: 10000,
	});
}

test.describe('Content processor routes @content', () => {
	test('renders first post from content processor with frontmatter and MDX content', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/posts/first-post');
		await expect(page.getByTestId('page-post')).toBeVisible();
		await expect(page.getByTestId('post-title')).toHaveText('First Post');
		await expect(page.getByTestId('post-description')).toHaveText(
			'Introductory post tested with content processor',
		);
		await expect(page.getByTestId('post-content-first-post')).toBeVisible();
		await expect(page).toHaveTitle('First Post | Kitchen Sink');

		runtime.assertClean();
	});

	test('renders second post with interactive React component and bundled stylesheet', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/posts/second-post');
		await expect(page.getByTestId('page-post')).toBeVisible();
		await expect(page.getByTestId('post-title')).toHaveText('Second Post');
		await expect(page.getByTestId('post-content-second-post')).toBeVisible();

		const highlight = page.getByTestId('post-highlight-text');
		await expect(highlight).toBeVisible();
		const color = await highlight.evaluate((el) => window.getComputedStyle(el).color);
		expect(color).toBe('rgb(2, 132, 199)');

		const counter = page.getByTestId('page-post').locator('[data-react-counter]');
		await expect(counter).toBeVisible();
		const value = counter.locator('[data-react-value]');
		const inc = counter.locator('[data-react-inc]');
		await expect(value).toHaveText('0');
		await incrementCounter(inc, value, '1');

		runtime.assertClean();
	});

	test('exercises hydratable client-side navigation between posts via in-page links', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/posts/first-post');
		await expect(page.getByTestId('page-post')).toBeVisible();
		await waitForReactPageHydration(page);

		// Click client-side link to second post (triggers preload and loadComponent browser loader)
		await page.getByTestId('next-post-link').click();
		await expect(page.getByTestId('post-content-second-post')).toBeVisible({ timeout: 15_000 });
		await waitForReactPageHydration(page);

		// Verify dynamic component loaded through /browser is interactive on the client
		const counter = page.getByTestId('page-post').locator('[data-react-counter]');
		await expect(counter).toBeVisible();
		const value = counter.locator('[data-react-value]');
		const inc = counter.locator('[data-react-inc]');
		await expect(value).toHaveText('0');
		await incrementCounter(inc, value, '1');

		// Navigate back via post link in navigation bar
		await page.getByTestId('post-link-first-post').click();
		await expect(page.getByTestId('post-content-first-post')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('post-title')).toHaveText('First Post');

		runtime.assertClean();
	});
});
