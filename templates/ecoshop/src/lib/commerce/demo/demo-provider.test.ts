import { describe, expect, it } from 'vitest';
import { CartInputError } from '../errors';
import { createDemoProvider } from './demo-provider';

const provider = createDemoProvider();
const fieldShirtM = 'gid://ecoshop/ProductVariant/field-shirt-m';

describe('demo provider catalog', () => {
	it('searches titles, types and tags without regard to case', async () => {
		const results = await provider.searchProducts('SHIRT');

		expect(results.map((product) => product.handle)).toEqual(['field-shirt', 'linen-overshirt', 'trail-tee']);
	});

	it('requires every search term to match', async () => {
		const results = await provider.searchProducts('linen shirt');

		expect(results.map((product) => product.handle)).toEqual(['linen-overshirt']);
	});

	it('limits listings', async () => {
		expect(await provider.listProducts({ limit: 2 })).toHaveLength(2);
	});

	it('returns a product with its variants and image', async () => {
		const product = await provider.getProduct('field-shirt');

		expect(product?.variants.map((variant) => variant.id)).toContain(fieldShirtM);
		expect(product?.priceRange.min).toEqual({ amount: '68.00', currencyCode: 'USD' });
		expect(product?.featuredImage?.url).toBe('/demo/field-shirt.svg');
	});

	it('resolves unknown handles to null', async () => {
		expect(await provider.getProduct('missing')).toBeNull();
		expect(await provider.getCollection('missing')).toBeNull();
	});

	it('returns a collection with its products in order', async () => {
		const page = await provider.getCollection('home');

		expect(page?.collection.title).toBe('Home');
		expect(page?.products.map((product) => product.handle)).toEqual(['steel-bottle', 'beeswax-wraps']);
	});
});

describe('demo provider cart', () => {
	it('creates a cart that a later lookup returns', async () => {
		const cart = await provider.setCartQuantities(undefined, [{ variantId: fieldShirtM, quantity: 2 }]);

		expect(cart.checkoutUrl).toBe('/demo-checkout');
		expect(cart.totalQuantity).toBe(2);
		expect(cart.subtotal).toEqual({ amount: '136.00', currencyCode: 'USD' });

		const found = await provider.getCart(cart.id);
		expect(found?.lines).toEqual([
			expect.objectContaining({ variantId: fieldShirtM, quantity: 2, productHandle: 'field-shirt' }),
		]);
	});

	it('adds to the quantity already in the cart', async () => {
		const first = await provider.addToCart(undefined, [{ variantId: fieldShirtM, quantity: 1 }]);
		const second = await provider.addToCart(first.id, [{ variantId: fieldShirtM, quantity: 2 }]);

		expect(second.lines[0]?.quantity).toBe(3);
	});

	it('removes a line set to zero', async () => {
		const cart = await provider.setCartQuantities(undefined, [{ variantId: fieldShirtM, quantity: 1 }]);
		const emptied = await provider.setCartQuantities(cart.id, [{ variantId: fieldShirtM, quantity: 0 }]);

		expect(emptied.lines).toEqual([]);
		expect(emptied.totalQuantity).toBe(0);
	});

	it('refuses unknown and sold-out variants', async () => {
		await expect(provider.addToCart(undefined, [{ variantId: 'nope', quantity: 1 }])).rejects.toBeInstanceOf(
			CartInputError,
		);
		await expect(
			provider.addToCart(undefined, [
				{ variantId: 'gid://ecoshop/ProductVariant/linen-overshirt-l', quantity: 1 },
			]),
		).rejects.toThrow(/sold out/u);
	});

	it('caps a line at the maximum quantity', async () => {
		const full = await provider.setCartQuantities(undefined, [{ variantId: fieldShirtM, quantity: 99 }]);

		await expect(provider.addToCart(full.id, [{ variantId: fieldShirtM, quantity: 1 }])).rejects.toThrow(
			/at most 99/u,
		);
	});

	it('refuses a variant listed twice when setting quantities', async () => {
		await expect(
			provider.setCartQuantities(undefined, [
				{ variantId: fieldShirtM, quantity: 60 },
				{ variantId: fieldShirtM, quantity: 60 },
			]),
		).rejects.toThrow(/listed twice/u);
	});

	it('treats a tampered cart id as no cart', async () => {
		const forge = (entries: unknown) => `demo-cart.${Buffer.from(JSON.stringify(entries)).toString('base64url')}`;

		expect(await provider.getCart('demo-cart.not-json')).toBeNull();
		expect(await provider.getCart('something-else')).toBeNull();
		expect(await provider.getCart(forge([[fieldShirtM, -5]]))).toBeNull();
		expect(await provider.getCart(forge([[fieldShirtM, 1.5]]))).toBeNull();
		expect(await provider.getCart(forge([[fieldShirtM, 500]]))).toBeNull();
		expect(await provider.getCart(forge([['gid://ecoshop/ProductVariant/unknown', 1]]))).toBeNull();
		expect(await provider.getCart(forge([[fieldShirtM]]))).toBeNull();
		expect(await provider.getCart(forge({ lines: [] }))).toBeNull();
	});
});
