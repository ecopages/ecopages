import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CartBackend } from '../backend.ts';
import type { CartToken } from '../types.ts';
import { createDatabaseCart, MAX_LINES, MAX_QUANTITY } from './cart.server.ts';
import { openTestCatalog } from './database.fixture.ts';
import { variantId } from './mappers.ts';
import { products } from './schema.ts';

describe('database cart limits', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;
	let cart: CartBackend;
	let variants: string[];

	beforeAll(async () => {
		database = await openTestCatalog();
		cart = createDatabaseCart(
			async () => database.db,
			() => 'cart-limits-test-secret-of-32-chars',
		);
		const rows = await database.db.select({ id: products.id, finishes: products.finishes }).from(products);
		variants = rows.slice(0, MAX_LINES + 2).map((row) => variantId(row.id, row.finishes.split(',')[0]!));
	});

	afterAll(() => database.dispose());

	async function cartWith(lineCount: number): Promise<string> {
		let token: CartToken = null;
		for (const id of variants.slice(0, lineCount)) {
			const update = await cart.addItem(token, { variantId: id, quantity: 1 });
			if (!update.ok) throw new Error(update.message);
			token = update.token;
		}
		return token!;
	}

	test('refuses a new line once the cart holds the most lines, and still takes more of a line it has', async () => {
		const token = await cartWith(MAX_LINES);

		const refused = await cart.addItem(token, { variantId: variants[MAX_LINES]!, quantity: 1 });
		const more = await cart.addItem(token, { variantId: variants[0]!, quantity: 1 });

		expect(refused).toMatchObject({ ok: false, reason: 'cart-full' });
		expect(more.ok && more.cart.lines).toHaveLength(MAX_LINES);
		expect((await cart.getCart(token)).itemCount).toBe(MAX_LINES + 1);
	});

	test('two lines added at once to a cart one short of full keep it at the limit', async () => {
		const token = await cartWith(MAX_LINES - 1);

		const results = await Promise.all([
			cart.addItem(token, { variantId: variants[MAX_LINES]!, quantity: 1 }),
			cart.addItem(token, { variantId: variants[MAX_LINES + 1]!, quantity: 1 }),
		]);

		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect((await cart.getCart(token)).lines).toHaveLength(MAX_LINES);
	});

	test('caps a line at the most of one variant and refuses an add once it is there', async () => {
		const first = await cart.addItem(null, { variantId: variants[0]!, quantity: MAX_QUANTITY + 5 });
		if (!first.ok) throw new Error(first.message);

		const refused = await cart.addItem(first.token, { variantId: variants[0]!, quantity: 1 });
		const set = await cart.updateItem(first.token, { variantId: variants[0]!, quantity: 3 });

		expect(first.cart.lines[0]?.quantity).toBe(MAX_QUANTITY);
		expect(refused).toMatchObject({ ok: false, reason: 'cart-full' });
		expect(set.ok && set.cart.itemCount).toBe(3);
	});

	test('refuses a quantity that is not a positive whole number', async () => {
		for (const quantity of [0, -1, 1.5, Number.NaN]) {
			expect(await cart.addItem(null, { variantId: variants[0]!, quantity })).toMatchObject({
				ok: false,
				reason: 'invalid-quantity',
			});
		}
	});
});
