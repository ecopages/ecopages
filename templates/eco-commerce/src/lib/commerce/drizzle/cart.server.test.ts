import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { LIMITS } from '../../limits.ts';
import type { CartBackend } from '../backend.ts';
import type { CartToken } from '../types.ts';
import { createDatabaseCart } from './cart.server.ts';
import { decodeCartToken } from './cart-token.server.ts';
import { openTestCatalog } from './database.fixture.ts';
import { variantId } from './mappers.ts';
import { carts, products } from './schema.ts';

const { cartLines: MAX_LINES, quantity: MAX_QUANTITY } = LIMITS;
const SECRET = 'cart-limits-test-secret-of-32-chars';

describe('database cart', () => {
	let database: Awaited<ReturnType<typeof openTestCatalog>>;
	let cart: CartBackend;
	let variants: string[];

	beforeAll(async () => {
		database = await openTestCatalog();
		cart = createDatabaseCart(
			async () => database.db,
			() => SECRET,
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
		if (!token) throw new Error('No line was added.');
		return token;
	}

	async function added(variant: string, quantity = 1): Promise<string> {
		const update = await cart.addItem(null, { variantId: variant, quantity });
		if (!update.ok || !update.token) throw new Error('The add was refused.');
		return update.token;
	}

	test('setting a new line on a full cart is refused, and a set above the most of one variant stores the most', async () => {
		const token = await cartWith(MAX_LINES);

		const refused = await cart.updateItem(token, { variantId: variants[MAX_LINES]!, quantity: 2 });
		const capped = await cart.updateItem(token, { variantId: variants[0]!, quantity: MAX_QUANTITY + 20 });

		expect(refused).toMatchObject({ ok: false, reason: 'cart-full' });
		expect(capped.ok && capped.cart.lines[0]?.quantity).toBe(MAX_QUANTITY);
	});

	test('a cart left untouched past its lifetime is removed when another cart starts', async () => {
		const stale = await added(variants[0]!);
		const recent = await added(variants[2]!);
		const staleId = decodeCartToken(stale, SECRET)!;
		const longAgo = Date.now() - (LIMITS.cartLifetimeSeconds + 24 * 60 * 60) * 1000;
		await database.db.update(carts).set({ updatedAt: longAgo }).where(eq(carts.id, staleId));

		await added(variants[1]!);

		expect(await database.db.select().from(carts).where(eq(carts.id, staleId))).toEqual([]);
		expect((await cart.getCart(stale)).lines).toEqual([]);
		expect((await cart.getCart(recent)).lines.map((line) => line.variantId)).toEqual([variants[2]]);
	});

	test('a signed token whose cart no longer exists starts a new cart with a new token', async () => {
		const token = await added(variants[0]!);
		await database.db.delete(carts).where(eq(carts.id, decodeCartToken(token, SECRET)!));

		const update = await cart.addItem(token, { variantId: variants[1]!, quantity: 1 });

		expect(update.ok && update.token).not.toBe(token);
		expect(update.ok && update.cart.lines.map((line) => line.variantId)).toEqual([variants[1]]);
	});

	test('a line whose product left the catalog drops out of the cart and its totals', async () => {
		const [gone] = await database.db
			.select({ id: products.id, finishes: products.finishes, priceCents: products.priceCents })
			.from(products)
			.where(eq(products.id, 100));
		const goneVariant = variantId(gone!.id, gone!.finishes.split(',')[0]!);
		const token = await added(variants[0]!);
		const both = await cart.addItem(token, { variantId: goneVariant, quantity: 2 });
		if (!both.ok) throw new Error(both.message);

		await database.db.delete(products).where(eq(products.id, gone!.id));
		const after = await cart.getCart(token);

		expect(both.cart.itemCount).toBe(3);
		expect(after.lines.map((line) => line.variantId)).toEqual([variants[0]]);
		expect(after.itemCount).toBe(1);
		expect(after.subtotal.amount).toBe(both.cart.subtotal.amount - gone!.priceCents * 2);
	});

	test('removing a line from a cart the visitor never had changes nothing and starts no cart', async () => {
		const before = await database.db.select().from(carts);

		const update = await cart.updateItem(null, { variantId: variants[0]!, quantity: 0 });

		expect(update).toMatchObject({ ok: true, token: null, cart: { lines: [], itemCount: 0 } });
		expect(await database.db.select().from(carts)).toHaveLength(before.length);
	});

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

describe('database cart after products leave the catalog', () => {
	test('lines whose products left the catalog stop taking places in a full cart', async () => {
		const database = await openTestCatalog();
		try {
			const cart = createDatabaseCart(
				async () => database.db,
				() => SECRET,
			);
			const rows = await database.db.select({ id: products.id, finishes: products.finishes }).from(products);
			const ids = rows.slice(0, MAX_LINES + 1).map((row) => variantId(row.id, row.finishes.split(',')[0]!));
			let token: CartToken = null;
			for (const id of ids.slice(0, MAX_LINES)) {
				const update = await cart.addItem(token, { variantId: id, quantity: 1 });
				if (!update.ok) throw new Error(update.message);
				token = update.token;
			}
			await database.db.delete(products).where(inArray(products.id, [rows[0]!.id, rows[1]!.id]));

			const update = await cart.addItem(token, { variantId: ids[MAX_LINES]!, quantity: 1 });

			expect(update.ok && update.cart.lines).toHaveLength(MAX_LINES - 1);
		} finally {
			database.dispose();
		}
	});
});
