import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { CartBackend } from '../backend.ts';
import type { Cart, CartLine, CartToken, CartUpdate } from '../types.ts';
import { decodeCartToken, encodeCartToken, newCartId } from './cart-token.server.ts';
import type { CatalogDb } from './database.server.ts';
import { money, parseVariantId, thumbnailUrl, variantId as toVariantId } from './mappers.ts';
import { cartLines, carts, products } from './schema.ts';

/** Distinct variants a cart holds. */
export const MAX_LINES = 50;

export const MAX_QUANTITY = 99;

/** Carts untouched for this long are removed when a new cart starts. */
const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const CART_FULL = `Your cart is full: it holds up to ${MAX_LINES} products and ${MAX_QUANTITY} of each.`;

/** Resolves a cart's lines against the catalog; a line whose product or finish no longer exists is left out. */
async function readCart(db: CatalogDb, cartId: string | null): Promise<Cart> {
	const lines = cartId
		? await db.select().from(cartLines).where(eq(cartLines.cartId, cartId)).orderBy(asc(cartLines.position))
		: [];
	const ids = lines.flatMap((line) => parseVariantId(line.variantId)?.productId ?? []);
	const rows = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : [];
	const byId = new Map(rows.map((row) => [row.id, row]));

	const cartLinesOut: CartLine[] = [];
	for (const line of lines) {
		const product = byId.get(parseVariantId(line.variantId)?.productId ?? -1);
		const finish = product?.finishes.split(',').find((name) => toVariantId(product.id, name) === line.variantId);
		if (!product || !finish) continue;
		cartLinesOut.push({
			variantId: line.variantId,
			productId: String(product.id),
			handle: product.slug,
			title: product.name,
			variantTitle: finish,
			thumbnail: thumbnailUrl(product.slug),
			quantity: line.quantity,
			unitPrice: money(product.priceCents),
			subtotal: money(product.priceCents * line.quantity),
		});
	}
	return {
		lines: cartLinesOut,
		itemCount: cartLinesOut.reduce((total, line) => total + line.quantity, 0),
		subtotal: money(cartLinesOut.reduce((total, line) => total + line.subtotal.amount, 0)),
	};
}

async function variantExists(db: CatalogDb, id: string): Promise<boolean> {
	const parsed = parseVariantId(id);
	if (!parsed) return false;
	const [row] = await db
		.select({ id: products.id, finishes: products.finishes })
		.from(products)
		.where(eq(products.id, parsed.productId));
	return Boolean(row?.finishes.split(',').some((finish) => toVariantId(row.id, finish) === id));
}

/** The cart id behind a token, creating a cart when the token names none that exists. */
async function ensureCart(db: CatalogDb, cartId: string | null): Promise<string> {
	const now = Date.now();
	if (cartId) {
		const updated = await db.update(carts).set({ updatedAt: now }).where(eq(carts.id, cartId)).returning();
		if (updated.length > 0) return cartId;
	}
	await db.delete(carts).where(lt(carts.updatedAt, now - CART_LIFETIME_MS));
	const id = newCartId();
	await db.insert(carts).values({ id, updatedAt: now });
	return id;
}

type Operation = { kind: 'add' | 'set'; variantId: string; quantity: number };

/**
 * Applies one change to one line as a single statement, so changes made at the same moment all land.
 *
 * @remarks
 * Adding and setting are one upsert each: a new line is inserted only while the cart has fewer than
 * `MAX_LINES` lines, and an add to a line already at `MAX_QUANTITY` changes nothing. SQLite runs each statement
 * atomically, so the limits hold against concurrent changes without a transaction, which libSQL would run on a
 * second connection and fail with `SQLITE_BUSY` under concurrency. Resolves `false` when the limits refused it.
 */
async function applyOperation(db: CatalogDb, cartId: string, operation: Operation): Promise<boolean> {
	const { variantId, quantity } = operation;
	if (operation.kind === 'set' && quantity === 0) {
		await db.delete(cartLines).where(and(eq(cartLines.cartId, cartId), eq(cartLines.variantId, variantId)));
		return true;
	}
	const stored = Math.min(quantity, MAX_QUANTITY);
	const onConflict =
		operation.kind === 'add'
			? sql`DO UPDATE SET quantity = min(cart_lines.quantity + ${quantity}, ${MAX_QUANTITY}) WHERE cart_lines.quantity < ${MAX_QUANTITY}`
			: sql`DO UPDATE SET quantity = ${stored}`;
	const result = await db.run(sql`
		INSERT INTO cart_lines (cart_id, variant_id, quantity, position)
		SELECT ${cartId}, ${variantId}, ${stored},
			coalesce((SELECT max(position) FROM cart_lines WHERE cart_id = ${cartId}), -1) + 1
		WHERE (SELECT count(*) FROM cart_lines WHERE cart_id = ${cartId}) < ${MAX_LINES}
			OR EXISTS (SELECT 1 FROM cart_lines WHERE cart_id = ${cartId} AND variant_id = ${variantId})
		ON CONFLICT (cart_id, variant_id) ${onConflict}
	`);
	return result.rowsAffected > 0;
}

/**
 * The cart of the Drizzle adapter: carts and their lines in the database, the cart id in a signed token.
 *
 * @remarks
 * Every change is one operation on one line, so changes made at the same moment from two tabs both land. The
 * token secret comes from `getSecret`, read per operation.
 */
export function createDatabaseCart(getDb: () => Promise<CatalogDb>, getSecret: () => string): CartBackend {
	async function change(token: CartToken, operation: Operation): Promise<CartUpdate> {
		const { quantity } = operation;
		if (!Number.isSafeInteger(quantity) || quantity < 0 || (operation.kind === 'add' && quantity === 0)) {
			return { ok: false, reason: 'invalid-quantity', message: 'The quantity is not valid.' };
		}
		const db = await getDb();
		if (quantity > 0 && !(await variantExists(db, operation.variantId))) {
			return { ok: false, reason: 'unknown-variant', message: 'That product option is not in the catalog.' };
		}
		const secret = getSecret();
		const cartId = await ensureCart(db, decodeCartToken(token, secret));
		if (!(await applyOperation(db, cartId, operation))) {
			return { ok: false, reason: 'cart-full', message: CART_FULL };
		}
		return { ok: true, token: encodeCartToken(cartId, secret), cart: await readCart(db, cartId) };
	}

	return {
		getCart: async (token) => readCart(await getDb(), decodeCartToken(token, getSecret())),
		addItem: (token, item) => change(token, { kind: 'add', ...item }),
		updateItem: (token, item) => change(token, { kind: 'set', ...item }),
	};
}
