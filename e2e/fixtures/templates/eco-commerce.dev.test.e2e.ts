import type { Page } from '@playwright/test';
import { expect, test } from '../../app-fixture.ts';

const SUBCATEGORY = '/collections/living/seating/lounge-chairs';

/** Opens the first product of the listing as a full page load, and returns its title. */
async function openFirstProduct(page: Page): Promise<string> {
	await page.goto(SUBCATEGORY);
	const card = page.locator('.product-card').first();
	const title = (await card.locator('.product-card__title').textContent()) ?? '';
	await page.goto((await card.getAttribute('href')) ?? '/');
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	return title;
}

/**
 * Waits until the page's islands are defined and the enhanced ones have connected, so a click goes to the
 * enhanced form rather than the plain one a visitor without JavaScript gets.
 */
async function waitForIslands(page: Page, ...tags: string[]): Promise<void> {
	await page.waitForFunction(
		(names) =>
			names.every((name) => customElements.get(name)) &&
			['add-to-cart', 'cart-link']
				.filter((name) => names.includes(name))
				.every((name) => document.querySelector(name)?.hasAttribute('data-enhanced')),
		tags,
	);
}

async function cartJson(
	page: Page,
): Promise<{ itemCount: number; lines: Array<{ title: string; variantTitle: string; quantity: number }> }> {
	return (await page.request.get('/api/cart')).json();
}

test.describe('eco-commerce template', () => {
	test('a visitor browses from a collection down to a product, each page listing its children', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('heading', { level: 2, name: 'Living' }).getByRole('link').click();
		await expect(page.getByRole('heading', { level: 1, name: 'Living' })).toBeVisible();

		await page.getByRole('link', { name: 'Seating', exact: true }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Seating' })).toBeVisible();

		await page
			.getByRole('link', { name: /^See all \d+$/ })
			.first()
			.click();
		await expect(page.getByRole('heading', { level: 1, name: 'Lounge chairs' })).toBeVisible();
		const card = page.locator('.product-card').first();
		const title = (await card.locator('.product-card__title').textContent()) ?? '';
		expect(title).toMatch(/lounge chair$/);

		await card.click();
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Lounge chairs');
	});

	test('the home page lists every subcategory as a prefetchable link', async ({ page }) => {
		await page.goto('/');

		expect(await page.locator('a.catalog-tile[data-eco-prefetch="viewport"]').count()).toBeGreaterThanOrEqual(96);
	});

	test('a subcategory listing pages through its products with links', async ({ page }) => {
		await page.goto(SUBCATEGORY);
		await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Go to page 2' }).click();

		await expect(page).toHaveURL(`${SUBCATEGORY}/page/2`);
		await expect(page.locator('.page-header').getByText('page 2 of 2')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Pages' }).locator('[aria-current="page"]')).toHaveText('2');
	});

	test('the search combobox script loads on first interaction, and what was typed meanwhile survives', async ({
		page,
	}) => {
		const requested: string[] = [];
		page.on('request', (request) => requested.push(new URL(request.url()).pathname));
		await page.goto('/');
		await page.waitForFunction(() => customElements.get('cart-link'));
		const searchScripts = await page.evaluate(() => {
			const map = JSON.parse(
				document.querySelector('script[type="ecopages/global-injector-map"]')?.textContent ?? '{}',
			) as Record<string, { 'on:interaction'?: { scripts: string[] } }>;
			return Object.values(map).flatMap((trigger) => trigger['on:interaction']?.scripts ?? []);
		});
		expect(searchScripts.length).toBeGreaterThan(0);
		expect(requested.filter((path) => searchScripts.includes(path))).toEqual([]);

		let releaseScripts = () => {};
		const held = new Promise<void>((resolve) => (releaseScripts = resolve));
		for (const script of searchScripts) {
			await page.route(`**${script}`, async (route) => {
				await held;
				await route.continue();
			});
		}
		const search = page.getByRole('combobox', { name: 'Search products' });
		await search.click();
		await expect.poll(() => requested.filter((path) => searchScripts.includes(path)).length).toBeGreaterThan(0);
		await search.pressSequentially('chair');
		expect(await page.evaluate(() => !!customElements.get('search-box'))).toBe(false);
		releaseScripts();
		await page.waitForFunction(() => customElements.get('rui-combobox') && customElements.get('search-box'));

		await expect(search).toHaveValue('chair');
		await expect(page.getByRole('option').first()).toBeVisible();
	});

	test('typing "chair" lists matching products, and Enter opens the search page', async ({ page }) => {
		await page.goto('/');
		const search = page.getByRole('combobox', { name: 'Search products' });
		await search.click();
		await search.pressSequentially('chair');

		const options = page.getByRole('option');
		await expect(options.first()).toBeVisible();
		await expect(options.filter({ hasNotText: /chair/i })).toHaveCount(0);

		await search.press('Escape');
		await search.press('Enter');
		await expect(page).toHaveURL(/\/search\?q=chair$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Results for “chair”' })).toBeVisible();
	});

	test('checking a material filters the listing without a submit', async ({ page }) => {
		await page.goto(SUBCATEGORY);
		await page.waitForFunction(
			() => customElements.get('product-filters') && customElements.get('rui-checkbox-group'),
		);
		const material = page.locator('product-filters input[name="material"]').first();
		const value = (await material.getAttribute('value')) ?? '';
		await material.check({ force: true });

		await expect(page).toHaveURL(new RegExp(`/search\\?in=lounge-chairs&material=${value}$`));
		await expect
			.poll(async () => {
				const titles = await page.locator('.product-card__title').allTextContents();
				return titles.length > 0 && titles.every((title) => title.toLowerCase().includes(value));
			})
			.toBe(true);
	});

	test('the header count goes up when a visitor adds a product, without a page load', async ({ page }) => {
		const [first] = (await (await page.request.get('/api/products?in=lounge-chairs&pageSize=1')).json()).items;
		const { variants } = await (await page.request.get(`/api/products/${first.handle}`)).json();
		await page.request.post('/cart/add', { form: { variantId: variants[0].id, quantity: '2' } });
		await openFirstProduct(page);
		const count = page.locator('cart-link [data-ref="count"]');
		await expect(count).toHaveText('2');
		await page.evaluate(() => {
			(window as Window & { __loadMarker?: boolean }).__loadMarker = true;
		});

		await waitForIslands(page, 'add-to-cart', 'cart-link', 'rui-toaster');
		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(count).toHaveText('3');
		await expect(page.getByText('Added to your cart.').first()).toBeVisible();
		expect(await page.evaluate(() => (window as Window & { __loadMarker?: boolean }).__loadMarker)).toBe(true);
		expect((await cartJson(page)).itemCount).toBe(3);
	});

	test('returning to the order page after another addition shows the new line without a full page load', async ({
		page,
	}) => {
		const title = await openFirstProduct(page);
		await waitForIslands(page, 'add-to-cart', 'cart-link', 'cart-drawer', 'rui-toaster');
		await page.evaluate(() => {
			(window as Window & { __loadMarker?: boolean }).__loadMarker = true;
		});
		const addToCart = async () => {
			const stored = page.waitForResponse((response) => response.url().endsWith('/cart/add'));
			await page.getByRole('button', { name: 'Add to cart' }).click();
			await stored;
		};
		const reviewOrder = async () => {
			await page.locator('cart-link a').click();
			await page.getByRole('link', { name: 'Review order' }).click();
			await expect(page.getByRole('heading', { level: 1, name: 'Your order' })).toBeVisible();
			await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeHidden();
		};

		await addToCart();
		await expect(page.locator('cart-link [data-ref="count"]')).toHaveText('1');
		await reviewOrder();
		await expect(page.locator('main').getByRole('spinbutton', { name: `Quantity of ${title}` })).toHaveValue('1');

		await page.locator('main').getByRole('link', { name: title }).click();
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await addToCart();
		await expect(page.locator('cart-link [data-ref="count"]')).toHaveText('2');
		await reviewOrder();

		await expect(page.locator('main').getByRole('spinbutton', { name: `Quantity of ${title}` })).toHaveValue('2');
		expect(await page.evaluate(() => (window as Window & { __loadMarker?: boolean }).__loadMarker)).toBe(true);
	});

	test('the chosen finish is carried into the cart line', async ({ page }) => {
		await openFirstProduct(page);
		await waitForIslands(page, 'add-to-cart', 'rui-radio-group', 'rui-toaster');
		const finish = page.locator('add-to-cart .rui-radio').nth(1);
		const finishName = ((await finish.textContent()) ?? '').trim();
		await finish.click();

		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByText('Added to your cart.').first()).toBeVisible();

		expect((await cartJson(page)).lines).toEqual([
			expect.objectContaining({ variantTitle: finishName, quantity: 1 }),
		]);
	});

	test('the cart link opens a drawer with the cart, where a line can be removed', async ({ page }) => {
		const title = await openFirstProduct(page);
		await waitForIslands(page, 'add-to-cart', 'cart-link', 'cart-drawer', 'rui-toaster');
		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByText('Added to your cart.').first()).toBeVisible();

		await page.locator('cart-link a').click();
		const drawer = page.getByRole('dialog', { name: 'Your cart' });
		await expect(drawer.getByRole('link', { name: title })).toBeVisible();

		await drawer.getByRole('button', { name: `Remove ${title}` }).click();
		await expect(drawer.getByText('Your cart is empty.')).toBeVisible();
		await expect(page.locator('cart-link [data-ref="count"]')).toBeHidden();
	});

	test('two quantity changes in the drawer reach the store in order, and the drawer shows the last', async ({
		page,
	}) => {
		const title = await openFirstProduct(page);
		await waitForIslands(page, 'add-to-cart', 'cart-link', 'cart-drawer', 'rui-toaster');
		await page.getByRole('button', { name: 'Add to cart' }).click();
		await expect(page.getByText('Added to your cart.').first()).toBeVisible();
		await page.locator('cart-link a').click();
		const quantity = page.getByRole('dialog', { name: 'Your cart' }).getByRole('spinbutton', {
			name: `Quantity of ${title}`,
		});
		await expect(quantity).toHaveValue('1');

		let firstIntercepted!: () => void;
		const firstHeld = new Promise<void>((resolve) => (firstIntercepted = resolve));
		let releaseFirst!: () => void;
		const firstReleased = new Promise<void>((resolve) => (releaseFirst = resolve));
		let held = false;
		await page.route('**/cart/update', async (route) => {
			if (!held) {
				held = true;
				firstIntercepted();
				await firstReleased;
			}
			await route.fulfill({ response: await route.fetch() });
		});

		await quantity.fill('2');
		await quantity.press('Tab');
		await firstHeld;
		await quantity.fill('3');
		await quantity.press('Tab');
		releaseFirst();

		await expect.poll(async () => (await cartJson(page)).itemCount).toBe(3);
		await expect(quantity).toHaveValue('3');
		await expect(page.locator('cart-link [data-ref="count"]')).toHaveText('3');
	});

	test('a product the visitor opened shows under "Recently viewed" on the next product page', async ({ page }) => {
		const first = await openFirstProduct(page);
		await page.waitForFunction((title) => localStorage.getItem('store:recently-viewed')?.includes(title), first);
		await page.goto(SUBCATEGORY);
		await page.locator('.product-card').nth(1).click();

		const strip = page.getByRole('region', { name: 'Recently viewed' });
		await strip.scrollIntoViewIfNeeded();
		await expect(strip.getByRole('link', { name: first })).toBeVisible();
	});

	test('a refused addition takes the header count back and says why', async ({ page }) => {
		const [first] = (await (await page.request.get('/api/products?in=lounge-chairs&pageSize=1')).json()).items;
		const { variants } = await (await page.request.get(`/api/products/${first.handle}`)).json();
		await page.request.post('/cart/add', { form: { variantId: variants[0].id, quantity: '99' } });
		await openFirstProduct(page);
		const count = page.locator('cart-link [data-ref="count"]');
		await expect(count).toHaveText('99');

		await waitForIslands(page, 'add-to-cart', 'cart-link', 'rui-toaster');
		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(page.getByText(/Your cart is full/u).first()).toBeVisible();
		await expect(count).toHaveText('99');
		expect((await cartJson(page)).itemCount).toBe(99);
	});

	test('two tabs that add different products at the same moment both land in the cart', async ({ context }) => {
		const [chair, lamp] = (await (await context.request.get('/api/products?in=lounge-chairs&pageSize=2')).json())
			.items;
		const variantOf = async (handle: string): Promise<string> =>
			(await (await context.request.get(`/api/products/${handle}`)).json()).variants[0].id;
		const [chairVariant, lampVariant] = await Promise.all([variantOf(chair.handle), variantOf(lamp.handle)]);
		await context.request.post('/cart/add', { form: { variantId: chairVariant, quantity: '1' } });
		const [tabA, tabB] = await Promise.all([context.newPage(), context.newPage()]);
		await Promise.all([tabA.goto('/order'), tabB.goto('/order')]);

		const add = (tab: Page, variantId: string) =>
			tab.evaluate(
				(id) =>
					fetch('/cart/add', {
						method: 'POST',
						headers: { accept: 'application/json' },
						body: new URLSearchParams({ variantId: id, quantity: '1' }),
					}).then((response) => response.status),
				variantId,
			);
		expect(await Promise.all([add(tabA, chairVariant), add(tabB, lampVariant)])).toEqual([200, 200]);

		const cart = await cartJson(tabA);
		expect(cart.lines.map((line) => [line.title, line.quantity])).toEqual([
			[chair.title, 2],
			[lamp.title, 1],
		]);
	});

	test('a tampered cart cookie shows an empty order, not an error page', async ({ page, context, baseURL }) => {
		await context.addCookies([{ name: 'store_cart', value: 'W1siMTpvYWsiLDFdXQ.forged', url: baseURL! }]);

		const response = await page.goto('/order');

		expect(response?.status()).toBe(200);
		await expect(page.getByText('Your cart is empty.')).toBeVisible();
	});
});

test.describe('eco-commerce template without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('submitting "Add to cart" opens the order page with the product once, in the default finish', async ({
		page,
	}) => {
		const title = await openFirstProduct(page);
		const finish = ((await page.locator('add-to-cart .rui-radio').first().textContent()) ?? '').trim();

		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(page).toHaveURL(/\/order$/);
		await expect(page.getByRole('link', { name: title })).toBeVisible();
		await expect(page.getByText(`${finish} ·`)).toBeVisible();
		await expect(page.getByLabel(`Quantity of ${title}`)).toHaveValue('1');
	});

	test('a second finish chosen on the product page is the one posted', async ({ page }) => {
		await openFirstProduct(page);
		const second = page.locator('add-to-cart .rui-radio').nth(1);
		const finish = ((await second.textContent()) ?? '').trim();
		await expect(page.locator('add-to-cart input[type="radio"]').first()).toBeChecked();
		await second.click();

		await page.getByRole('button', { name: 'Add to cart' }).click();

		await expect(page).toHaveURL(/\/order$/);
		await expect(page.getByText(`${finish} ·`)).toBeVisible();
	});

	test('a listing page links to its neighbours, with the current page marked', async ({ page }) => {
		await page.goto(SUBCATEGORY);
		const pages = page.getByRole('navigation', { name: 'Pages' });
		await expect(pages.locator('[aria-current="page"]')).toHaveText('1');
		await pages.getByRole('link', { name: 'Go to page 2' }).click();

		await expect(page).toHaveURL(`${SUBCATEGORY}/page/2`);
		await expect(pages.locator('[aria-current="page"]')).toHaveText('2');
		await expect(pages.getByRole('link', { name: 'Go to previous page' })).toHaveAttribute('href', SUBCATEGORY);
	});

	test('the search form and the filter form are plain GET forms', async ({ page }) => {
		await page.goto('/');
		await page.locator('search-box input[name="q"]').fill('chair');
		await page.locator('search-box input[name="q"]').press('Enter');
		await expect(page).toHaveURL(/\/search\?q=chair$/);

		await page.goto(SUBCATEGORY);
		await page.locator('product-filters label', { hasText: 'Price, low to high' }).click();
		await page.getByRole('button', { name: 'Apply' }).click();

		await expect(page).toHaveURL(/\/search\?in=lounge-chairs&sort=price-asc/);
		const prices = await page
			.locator('.product-card__price')
			.evaluateAll((elements) =>
				elements.map((element) => Number(element.firstChild?.textContent?.replace(/[^0-9.]/g, ''))),
			);
		expect(prices.length).toBeGreaterThan(1);
		expect(prices).toEqual([...prices].sort((a, b) => a - b));
	});
});
