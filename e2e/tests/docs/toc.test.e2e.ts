import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * E2E tests for the Docs Table of Contents (radiant-toc).
 *
 * Covers:
 */
test.describe('Docs TOC', () => {
	// A page known to have multiple h2/h3 headings
	const PAGE = '/docs/ecosystem/browser-router';
	const TOC = 'radiant-toc';

	test.beforeEach(async ({ page }) => {
		await gotoAndWait(page, PAGE);
		await page.waitForFunction(() => !!(window as any).__ecopages_browser_router__);
	});

	test('renders a TOC with links matching page h2/h3 headings', async ({ page }) => {
		const toc = page.locator(TOC);
		await expect(toc).toBeVisible();

		const installationLink = toc.locator('a[data-toc-link="installation"]');
		await expect(installationLink).toBeVisible();
		await expect(installationLink).toHaveAttribute('href', '#installation');

		const setupLink = toc.locator('a[data-toc-link="setup"]');
		await expect(setupLink).toBeVisible();
		await expect(setupLink).toHaveAttribute('href', '#setup');
	});

	test('TOC links have correct slug IDs derived from heading text', async ({ page }) => {
		const toc = page.locator(TOC);

		const links = toc.locator('a[data-toc-link]');
		const count = await links.count();
		expect(count).toBeGreaterThan(0);

		for (let i = 0; i < count; i++) {
			const id = await links.nth(i).getAttribute('data-toc-link');
			expect(id).toMatch(/^[\w-]+$/);
		}
	});

	test('clicking a TOC link scrolls to the target heading — not the top of the page', async ({ page }) => {
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		const toc = page.locator(TOC);
		const installationLink = toc.locator('a[data-toc-link="installation"]');
		await installationLink.click();

		await expect(page).toHaveURL(/#installation$/);

		const heading = page.locator('#installation').first();
		await expect(heading).toBeInViewport({ ratio: 0.5 });

		const scrollY = await page.evaluate(() => window.scrollY);
		expect(scrollY).toBeGreaterThan(0);
	});

	test('clicking a TOC link keeps the clicked item active while the page scrolls toward it', async ({ page }) => {
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

		const toc = page.locator(TOC);
		const installationLink = toc.locator('a[data-toc-link="installation"]');
		await installationLink.click();

		const sampledActiveIds = await page.evaluate(async () => {
			const activeIds: string[] = [];
			for (let index = 0; index < 5; index++) {
				await new Promise((resolve) => window.setTimeout(resolve, 100));
				const activeLink = document.querySelector<HTMLAnchorElement>('radiant-toc a.toc-active');
				activeIds.push(activeLink?.getAttribute('data-toc-link') ?? '');
			}
			return activeIds;
		});

		expect(sampledActiveIds).toEqual(Array(5).fill('installation'));
	});

	test('browser router does not intercept TOC anchor clicks (no full-page fetch)', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (req) => {
			if (req.resourceType() === 'document') {
				requests.push(req.url());
			}
		});

		const toc = page.locator(TOC);
		const setupLink = toc.locator('a[data-toc-link="setup"]');
		await setupLink.click();

		await page.waitForTimeout(300);

		const extraDocRequests = requests.filter((url) => !url.includes(PAGE));
		expect(extraDocRequests).toHaveLength(0);
	});

	test('active TOC link is highlighted after scrolling its heading into view', async ({ page }) => {
		await page.evaluate(() => {
			const el = document.querySelector('#features');
			el?.scrollIntoView({ behavior: 'instant' });
		});

		const featuresLink = page.locator(TOC).locator('a[data-toc-link="features"]');
		await expect(featuresLink).toHaveClass(/toc-active/, { timeout: 3000 });
	});

	test('only one TOC link is active at a time', async ({ page }) => {
		await page.evaluate(() => {
			const el = document.querySelector('#setup');
			el?.scrollIntoView({ behavior: 'instant' });
		});

		await page.waitForTimeout(500);

		const activeLinks = page.locator(`${TOC} a.toc-active`);
		await expect(activeLinks).toHaveCount(1);
	});

	test('TOC re-renders correctly after SPA navigation to another page', async ({ page }) => {
		await page.click('[data-testid="docs-nav-link:/docs/getting-started/introduction"]');
		await page.waitForURL('**/docs/getting-started/introduction');
		await waitForPageReady(page, '/docs/getting-started/introduction');

		const toc = page.locator(TOC);

		const previousPageLink = toc.locator('a[data-toc-link="browser-router"]');
		await expect(previousPageLink).toHaveCount(0);

		const anyLink = toc.locator('a[data-toc-link]');
		await expect(anyLink.first()).toBeVisible();
	});

	test('TOC is empty on a page with no headings', async ({ page }) => {
		const headingCount = await page.locator('.docs-layout__content h2, .docs-layout__content h3').count();

		if (headingCount === 0) {
			const tocContent = await page.locator(TOC).innerHTML();
			expect(tocContent.trim()).toBe('');
		} else {
			const tocLinks = page.locator(`${TOC} a[data-toc-link]`);
			await expect(tocLinks.first()).toBeVisible();
		}
	});
});
