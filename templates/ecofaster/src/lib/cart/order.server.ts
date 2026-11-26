import { getProductsByIds } from '../catalog/queries.server.ts';
import type { ProductSummary } from '../catalog/types.ts';
import type { CatalogDb } from '../db/catalog-database.server.ts';
import { formatPrice, productUrl } from '../catalog/urls.ts';
import type { Cart, CartSummary } from './cart.ts';

export type OrderLine = {
	product: ProductSummary;
	quantity: number;
	subtotalCents: number;
};

export type Order = {
	lines: OrderLine[];
	count: number;
	totalCents: number;
};

/**
 * Resolves a cart's lines against the catalog, in the order they were added.
 *
 * @remarks
 * A product id the catalog does not have is left out. Carts signed before a regeneration never get here: the
 * signing key changes with the catalog (see `getCartDeps`), so their cookies read as empty.
 */
export async function getOrder(db: CatalogDb, cart: Cart): Promise<Order> {
	const products = await getProductsByIds(
		db,
		cart.lines.map((line) => line.productId),
	);
	const byId = new Map(products.map((product) => [product.id, product]));
	const lines: OrderLine[] = [];
	for (const line of cart.lines) {
		const product = byId.get(line.productId);
		if (product)
			lines.push({ product, quantity: line.quantity, subtotalCents: product.priceCents * line.quantity });
	}
	return {
		lines,
		count: lines.reduce((total, line) => total + line.quantity, 0),
		totalCents: lines.reduce((total, line) => total + line.subtotalCents, 0),
	};
}

/** The order as the JSON cart responses report it, with prices formatted and product links. */
export function toCartSummary(order: Order): CartSummary {
	return {
		count: order.count,
		lines: order.lines.map((line) => ({
			productId: line.product.id,
			product: line.product.slug,
			name: line.product.name,
			url: productUrl(line.product),
			quantity: line.quantity,
			price: formatPrice(line.product.priceCents),
			subtotal: formatPrice(line.subtotalCents),
		})),
		total: formatPrice(order.totalCents),
	};
}
