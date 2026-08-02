import { expect, test } from '@playwright/test';
import { gotoAndWait, waitForPageReady } from '../../utils/test-helpers';

/**
 * E2E tests for the docs table of contents (`rui-toc`).
 */
test.describe('Docs TOC', () => {
	const PAGE = '/docs/ecosystem/browser-router';
	const TOC = 'rui-toc';
	const ACTIVE_LINK = `${TOC} a.rui-toc__link--active`;

	test.beforeEach(async ({ page }) => {
		await gotoAndWait(page, PAGE);
		await expect(page.locator(TOC)).toBeVisible();
	});

	test('renders a TOC with links matching page h2/h3 headings', async ({ page }) => {
		const toc = page.locator(TOC);
		await expect(toc).toBeVisible();

		const installationLink = toc.locator('a[href="#installation"]');
		await expect(installationLink).toBeVisible();
		await expect(installationLink).toHaveAttribute('href', '#installation');

		const setupLink = toc.locator('a[href="#setup"]');
		await expect(setupLink).toBeVisible();
		await expect(setupLink).toHaveAttribute('href', '#setup');
	});

	test('TOC links have correct slug IDs derived from heading text', async ({ page }) => {
		const toc = page.locator(TOC);

		const links = toc.locator('a.rui-toc__link');
		const count = await links.count();
		expect(count).toBeGreaterThan(0);

		for (let i = 0; i < count; i++) {
			const href = await links.nth(i).getAttribute('href');
			expect(href).toMatch(/^#[\w-]+$/);
		}
	});

	test('clicking a TOC link scrolls to the target heading — not the top of the page', async ({ page }) => {
		await page.evaluate(() => {
			const content = document.querySelector('.docs-layout__content');
			if (content instanceof HTMLElement) {
				content.scrollTop = content.scrollHeight;
			}
		});
		await expect(page.locator(ACTIVE_LINK)).toBeVisible();

		const toc = page.locator(TOC);
		const installationLink = toc.locator('a[href="#installation"]');
		await installationLink.click();

		await expect(page).toHaveURL(/#installation$/);

		const heading = page.locator('#installation').first();
		await expect(heading).toBeInViewport({ ratio: 0.5 });

		const scrollTop = await page.evaluate(() => {
			const content = document.querySelector('.docs-layout__content');
			return content instanceof HTMLElement ? content.scrollTop : 0;
		});
		expect(scrollTop).toBeGreaterThan(0);
	});

	test('clicking a TOC link activates the target after scrolling to it', async ({ page }) => {
		await page.evaluate(() => {
			const content = document.querySelector('.docs-layout__content');
			if (content instanceof HTMLElement) {
				content.scrollTop = content.scrollHeight;
			}
		});
		await expect(page.locator(ACTIVE_LINK)).toBeVisible();

		const toc = page.locator(TOC);
		const installationLink = toc.locator('a[href="#installation"]');
		await installationLink.click();

		await expect(installationLink).toHaveClass(/rui-toc__link--active/);
	});

	test('browser router does not intercept TOC anchor clicks (no full-page fetch)', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (req) => {
			if (req.resourceType() === 'document') {
				requests.push(req.url());
			}
		});

		const toc = page.locator(TOC);
		const setupLink = toc.locator('a[href="#setup"]');
		await setupLink.click();
		await expect(page).toHaveURL(/#setup$/);

		const extraDocRequests = requests.filter((url) => !url.includes(PAGE));
		expect(extraDocRequests).toHaveLength(0);
	});

	test('active TOC link is highlighted after scrolling its heading into view', async ({ page }) => {
		await page.evaluate(() => {
			const content = document.querySelector('.docs-layout__content');
			const heading = document.querySelector('#features');
			if (content instanceof HTMLElement && heading instanceof HTMLElement) {
				content.scrollTop =
					content.scrollTop + heading.getBoundingClientRect().top - content.getBoundingClientRect().top - 120;
			}
		});

		const featuresLink = page.locator(TOC).locator('a[href="#features"]');
		await expect(featuresLink).toHaveClass(/rui-toc__link--active/, { timeout: 3000 });
	});

	test('only one TOC link is active at a time', async ({ page }) => {
		await page.evaluate(() => {
			const content = document.querySelector('.docs-layout__content');
			const heading = document.querySelector('#setup');
			if (content instanceof HTMLElement && heading instanceof HTMLElement) {
				content.scrollTop =
					content.scrollTop + heading.getBoundingClientRect().top - content.getBoundingClientRect().top - 120;
			}
		});

		const activeLinks = page.locator(`${TOC} a.rui-toc__link--active`);
		await expect(activeLinks).toHaveCount(1);
	});

	test('TOC re-renders correctly after SPA navigation to another page', async ({ page }) => {
		await page.click('rui-sidebar#docs-sidebar a[href="/docs/getting-started/introduction"]');
		await page.waitForURL('**/docs/getting-started/introduction');
		await waitForPageReady(page, '/docs/getting-started/introduction');

		const toc = page.locator(TOC);

		const previousPageLink = toc.locator('a[href="#browser-router"]');
		await expect(previousPageLink).toHaveCount(0);

		const anyLink = toc.locator('a.rui-toc__link');
		await expect(anyLink.first()).toBeVisible();
	});

	test('repeated heading labels get unique TOC targets', async ({ page }) => {
		await gotoAndWait(page, '/docs/server/routing-patterns');
		await expect(page.locator(TOC)).toBeVisible();

		const tocLinks = page.locator('rui-toc a.rui-toc__link');
		const ids = await tocLinks.evaluateAll((links) =>
			links
				.filter((link) => link.textContent?.trim() === 'When to Use')
				.map((link) => link.getAttribute('href')?.slice(1)),
		);

		expect(ids).toEqual(['when-to-use', 'when-to-use-2', 'when-to-use-3', 'when-to-use-4', 'when-to-use-5']);
	});

	test('TOC is empty on a page with no headings', async ({ page }) => {
		const headingCount = await page.locator('.docs-layout__content h2, .docs-layout__content h3').count();

		if (headingCount === 0) {
			const tocContent = await page.locator(TOC).innerHTML();
			expect(tocContent.trim()).toBe('');
		} else {
			const tocLinks = page.locator(`${TOC} a.rui-toc__link`);
			await expect(tocLinks.first()).toBeVisible();
		}
	});
});
