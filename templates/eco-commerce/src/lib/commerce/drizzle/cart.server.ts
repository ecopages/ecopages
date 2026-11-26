import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { CartBackend } from '../backend.ts';
import type { Cart, CartLine, CartToken, CartUpdate } from '../types.ts';
import { decodeCartToken, encodeCartToken, newCartId } from './cart-token.server.ts';
import type { CatalogDb } from './database.server.ts';
import { LIMITS } from '../../limits.ts';
import { findFinish, money, parseVariantId, thumbnailUrl } from './mappers.ts';
import { cartLines, carts, products } from './schema.ts';

const { cartLines: MAX_LINES, quantity: MAX_QUANTITY } = LIMITS;

/** Carts untouched for this long are removed when a new cart starts. */
const CART_LIFETIME_MS = LIMITS.cartLifetimeSeconds * 1000;

const CART_FULL = `Your cart is full: it holds up to ${MAX_LINES} product options and ${MAX_QUANTITY} of each.`;

/**
 * A cart's stored lines resolved against the catalog: the lines it can still sell, and the variant ids of those
 * whose product or finish no longer exists.
 */
async function resolveLines(db: CatalogDb, cartId: string | null): Promise<{ lines: CartLine[]; missing: string[] }> {
	const stored = cartId
		? await db.select().from(cartLines).where(eq(cartLines.cartId, cartId)).orderBy(asc(cartLines.position))
		: [];
	const ids = stored.flatMap((line) => parseVariantId(line.variantId)?.productId ?? []);
	const rows = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : [];
	const byId = new Map(rows.map((row) => [row.id, row]));

	const lines: CartLine[] = [];
	const missing: string[] = [];
	for (const line of stored) {
		const product = byId.get(parseVariantId(line.variantId)?.productId ?? -1);
		const finish = product && findFinish(product, line.variantId);
		if (!product || !finish) {
			missing.push(line.variantId);
			continue;
		}
		lines.push({
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
	return { lines, missing };
}

/** A cart as the visitor sees it; a line whose product or finish no longer exists is left out. */
async function readCart(db: CatalogDb, cartId: string | null): Promise<Cart> {
	const { lines } = await resolveLines(db, cartId);
	return {
		lines,
		itemCount: lines.reduce((total, line) => total + line.quantity, 0),
		subtotal: money(lines.reduce((total, line) => total + line.subtotal.amount, 0)),
	};
}

/**
 * Deletes the lines the catalog can no longer sell, before a change counts the cart's lines against
 * `LIMITS.cartLines`, so a line the visitor cannot see never takes a place in the cart.
 */
async function dropMissingLines(db: CatalogDb, cartId: string): Promise<void> {
	const { missing } = await resolveLines(db, cartId);
	if (missing.length > 0) {
		await db.delete(cartLines).where(and(eq(cartLines.cartId, cartId), inArray(cartLines.variantId, missing)));
	}
}

async function variantExists(db: CatalogDb, id: string): Promise<boolean> {
	const parsed = parseVariantId(id);
	if (!parsed) return false;
	const [row] = await db
		.select({ id: products.id, finishes: products.finishes })
		.from(products)
		.where(eq(products.id, parsed.productId));
	return Boolean(row && findFinish(row, id));
}

/** Marks the cart behind `cartId` as just changed; resolves `false` when no such cart exists. */
async function touchCart(db: CatalogDb, cartId: string | null): Promise<boolean> {
	if (!cartId) return false;
	const updated = await db.update(carts).set({ updatedAt: Date.now() }).where(eq(carts.id, cartId)).returning();
	return updated.length > 0;
}

/**
 * The cart id behind a token, creating a cart when the token names none that exists.
 *
 * @remarks
 * Starting a cart also removes the carts nobody changed for `LIMITS.cartLifetimeSeconds`, which the cookie no longer
 * names either.
 */
async function ensureCart(db: CatalogDb, cartId: string | null): Promise<string> {
	if (cartId && (await touchCart(db, cartId))) return cartId;
	const now = Date.now();
	await db.delete(carts).where(lt(carts.updatedAt, now - CART_LIFETIME_MS));
	const id = newCartId();
	await db.insert(carts).values({ id, updatedAt: now });
	return id;
}

/**
 * The cart a change applies to: an existing or new cart for an add, and only an existing one for a removal, so
 * removing from a cart the visitor never had starts none.
 */
async function cartFor(db: CatalogDb, existing: string | null, quantity: number): Promise<string | null> {
	if (quantity > 0) return ensureCart(db, existing);
	return existing && (await touchCart(db, existing)) ? existing : null;
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
		const existing = decodeCartToken(token, secret);
		const cartId = await cartFor(db, existing, quantity);
		if (!cartId) return { ok: true, token: null, cart: await readCart(db, null) };
		if (quantity > 0) await dropMissingLines(db, cartId);
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
