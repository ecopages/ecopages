import type { Money, Place, ProductCard, ProductVariant } from '../types.ts';
import { products } from './schema.ts';
import { slugify } from './seed/product-generator.ts';

/** The generated catalog prices everything in US dollars. */
export const CURRENCY = 'usd';

/** The columns a product card needs, for `select()`. */
export const productCardColumns = {
	id: products.id,
	slug: products.slug,
	name: products.name,
	priceCents: products.priceCents,
	compareAtCents: products.compareAtCents,
	badge: products.badge,
	material: products.material,
};

type ProductCardRow = {
	id: number;
	slug: string;
	name: string;
	priceCents: number;
	compareAtCents: number | null;
	badge: 'new' | 'sale' | null;
	material: string;
};

export function money(amount: number): Money {
	return { amount, currencyCode: CURRENCY };
}

/** The generated placeholder image served by `src/pages/images/products/[slug].api.ts`. */
export function thumbnailUrl(slug: string): string {
	return `/images/products/${slug}`;
}

export function toPlace(row: { id: number; slug: string; name: string }): Place {
	return { id: String(row.id), handle: row.slug, name: row.name };
}

export function toProductCard(row: ProductCardRow): ProductCard {
	return {
		id: String(row.id),
		handle: row.slug,
		title: row.name,
		price: money(row.priceCents),
		compareAtPrice: row.compareAtCents === null ? null : money(row.compareAtCents),
		badge: row.badge,
		material: row.material,
		thumbnail: thumbnailUrl(row.slug),
	};
}

/** A variant id joins the product id and the finish slug: `12:moss-green`. */
export function variantId(productId: number, finish: string): string {
	return `${productId}:${slugify(finish)}`;
}

export function parseVariantId(id: string): { productId: number; finish: string } | null {
	const match = /^(\d+):([a-z0-9-]+)$/u.exec(id);
	return match ? { productId: Number(match[1]), finish: match[2]! } : null;
}

export function toVariants(productId: number, finishes: string): ProductVariant[] {
	return finishes.split(',').map((finish) => ({ id: variantId(productId, finish), title: finish }));
}
