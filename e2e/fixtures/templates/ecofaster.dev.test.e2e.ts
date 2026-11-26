import { expect, test } from '../../app-fixture.ts';

test.describe('ecofaster template', () => {
	test('a visitor browses from a collection down to a product, each page listing its children', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Browse living' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Living' })).toBeVisible();

		await page.getByRole('link', { name: 'See all seating' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Seating' })).toBeVisible();

		await page
			.getByRole('link', { name: /^See all \d+$/ })
			.first()
			.click();
		await expect(page.getByRole('heading', { level: 1, name: 'Lounge chairs' })).toBeVisible();
		const firstProduct = page.locator('.product-card').first();
		const productName = (await firstProduct.locator('.product-card__name').textContent()) ?? '';
		expect(productName).toMatch(/lounge chair$/);

		await firstProduct.click();
		await expect(page.getByRole('heading', { level: 1, name: productName })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Lounge chairs');
	});

	test('typing "chair" lists matching products, and submitting opens the search page', async ({ page }) => {
		await page.goto('/');
		const search = page.getByRole('searchbox', { name: 'Search products' });
		await search.click();
		await search.pressSequentially('chair');

		const names = page.locator('.search-suggestions__name');
		await expect(names.first()).toBeVisible();
		await expect(names.filter({ hasNotText: /chair/i })).toHaveCount(0);

		await search.press('Enter');
		await expect(page).toHaveURL(/\/search\?q=chair$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Results for “chair”' })).toBeVisible();
		await expect(page.locator('.product-card').first()).toBeVisible();
	});

	test('the header count goes up when a visitor adds a product, without a page load', async ({ page }) => {
		await page.request.post('/cart/add', { form: { productId: '1', quantity: '2' } });
		await page.goto('/collections/living/seating/lounge-chairs');
		await page.locator('.product-card').first().click();
		await expect(page.locator('add-to-cart')).toHaveAttribute('data-status', 'idle');
		const count = page.locator('cart-link [data-ref="count"]');
		await expect(count).toHaveText('2');
		const productUrl = page.url();
		await page.evaluate(() => {
			(window as Window & { __loadMarker?: boolean }).__loadMarker = true;
		});

		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(count).toHaveText('3');
		await expect(page.getByRole('status').filter({ hasText: 'Added to your cart.' })).toBeVisible();
		expect(page.url()).toBe(productUrl);
		expect(await page.evaluate(() => (window as Window & { __loadMarker?: boolean }).__loadMarker)).toBe(true);
		expect(((await (await page.request.get('/api/cart')).json()) as { count: number }).count).toBe(3);
	});

	test('a tampered cart cookie shows an empty order, not an error page', async ({ page, context, baseURL }) => {
		await context.addCookies([{ name: 'ecofaster_cart', value: 'W1sxLDFdXQ.forged', url: baseURL! }]);

		const response = await page.goto('/order');

		expect(response?.status()).toBe(200);
		await expect(page.getByText('Your cart is empty.')).toBeVisible();
	});
});

test.describe('ecofaster template without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('submitting "Add to cart" opens the order page with the product once', async ({ page }) => {
		await page.goto('/collections/living/seating/lounge-chairs');
		const productName = (await page.locator('.product-card__name').first().textContent()) ?? '';
		await page.locator('.product-card').first().click();

		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(page).toHaveURL(/\/order$/);
		await expect(page.getByRole('link', { name: productName })).toBeVisible();
		await expect(page.getByRole('spinbutton', { name: `Quantity of ${productName}` })).toHaveValue('1');
	});

	test('the search form opens the results page', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('searchbox', { name: 'Search products' }).fill('chair');
		await page.getByRole('searchbox', { name: 'Search products' }).press('Enter');

		await expect(page).toHaveURL(/\/search\?q=chair$/);
		await expect(page.locator('.product-card').first()).toBeVisible();
	});
});
