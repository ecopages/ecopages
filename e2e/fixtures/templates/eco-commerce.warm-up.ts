import type { Browser } from '@playwright/test';

/** One page of each kind, so every route and every browser script the tests reach has loaded once. */
const WARM_UP_PATHS = [
	'/',
	'/collections/living',
	'/collections/living/seating/lounge-chairs',
	'/collections/living/seating/lounge-chairs/page/2',
	'/search?q=chair',
	'/order',
];

/**
 * Loads every kind of storefront page once on a fresh dev server, and a product page found from the listing.
 *
 * @remarks
 * A fresh `ecopages dev` process discovers the browser's bare imports page by page, rebuilds its vendor graph,
 * and then reloads every connected page, so a test's first visit to a page kind could be reloaded midway. It also
 * compiles each route on its first request, which under load can outlast an assertion's timeout. Two passes let
 * the vendor graph settle before any test runs; the tests then cover the storefront, not dev-server cold start.
 */
export async function warmUpStorefront(browser: Browser, baseURL: string): Promise<void> {
	const page = await browser.newPage({ baseURL });
	try {
		const product = await page.request.get('/api/products?in=lounge-chairs&pageSize=1');
		const [first] = (await product.json()).items as Array<{ handle: string }>;
		const paths = [...WARM_UP_PATHS, `/products/${first!.handle}`];
		for (let pass = 0; pass < 2; pass++) {
			for (const path of paths) {
				await page.goto(path, { waitUntil: 'load' });
			}
		}
	} finally {
		await page.close();
	}
}
