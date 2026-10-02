import { expect, test, type Page } from '@playwright/test';

function count(html: string, pattern: RegExp): number {
	return html.match(pattern)?.length ?? 0;
}

async function markDocument(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as Window & { __ECO_E2E_SAME_DOCUMENT__?: boolean }).__ECO_E2E_SAME_DOCUMENT__ = true;
	});
}

async function isSameDocument(page: Page): Promise<boolean> {
	return page.evaluate(() =>
		Boolean((window as Window & { __ECO_E2E_SAME_DOCUMENT__?: boolean }).__ECO_E2E_SAME_DOCUMENT__),
	);
}

test.describe('HTML Pages static export', () => {
	test('renders each Page inside the Html shell with one document structure', async ({ request }) => {
		const html = await (await request.get('/about')).text();

		expect(count(html, /<!doctype html>/gi)).toBe(1);
		expect(count(html, /<html[\s>]/gi)).toBe(1);
		expect(count(html, /<meta charset/gi)).toBe(1);
		expect(count(html, /<title>/gi)).toBe(1);
		expect(html).toContain('<title>About us</title>');
		expect(html).toMatch(/<meta name="description" content="Who we are\." ?\/?>/);
		expect(count(html, /<meta name="description"/g)).toBe(1);
		expect(html).toMatch(/<link rel="canonical" href="https:\/\/example\.com\/about" ?\/?>/);
		expect(count(html, /href="\/assets\/includes\/site\.css"/g)).toBe(1);
		expect(html).toMatch(/<link rel="stylesheet" href="\/assets\/pages\/about\.css" ?\/?><\/head>/);
		expect(html).toMatch(/<img src="\/images\/team\.svg" alt="Our team" ?\/?>/);
		expect(html).toMatch(/<\/main>\s*<script type="module" src="\/assets\/pages\/counter[^"]*\.js"><\/script>/);
	});

	test('merges root attributes from a pasted document', async ({ request }) => {
		const html = await (await request.get('/landing')).text();

		expect(html).toContain('<html lang="fr" class="marketing">');
		expect(html).toContain('<body class="campaign">');
		expect(html).toContain('<script src="/assets/pages/vendor/tiny-query.js"></script>');
		expect(count(html, /<meta charset/gi)).toBe(1);
		expect(count(html, /<meta name="robots"/g)).toBe(1);
	});

	test('serves 404.html and leaves noindex Pages out of the sitemap', async ({ request }) => {
		const notFound = await request.get('/missing-page');
		expect(notFound.status()).toBe(404);
		expect(await notFound.text()).toContain('Page not found');

		const sitemap = await (await request.get('/sitemap.xml')).text();
		expect(sitemap).toContain('/about</loc>');
		expect(sitemap).not.toContain('/landing</loc>');
	});
});

test.describe('HTML Pages in the browser', () => {
	test('runs Page scripts on a full document load', async ({ page }) => {
		await page.goto('/about');
		await expect(page.locator('my-counter button')).toHaveText('Count: 2');
		await expect(page.locator('main')).toHaveCSS('color', 'rgb(0, 0, 128)');

		await page.goto('/landing');
		await expect(page.locator('main')).toHaveClass('ready');
		await expect(page.locator('main')).toHaveCSS('outline-color', 'rgb(255, 0, 0)');
	});

	test('runs body scripts after browser-router client navigation', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('home')).toBeVisible();
		await markDocument(page);

		await page.getByTestId('nav-about').click();
		await expect(page.getByTestId('about')).toBeVisible();
		await expect(page.locator('my-counter button')).toHaveText('Count: 2');

		await page.getByTestId('nav-landing').click();
		await expect(page.getByTestId('landing')).toHaveClass('ready');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

		expect(await isSameDocument(page)).toBe(true);
	});
});
