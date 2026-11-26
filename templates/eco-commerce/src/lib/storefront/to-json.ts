import { formatMoney } from '../commerce/money.ts';
import type { Cart, Product, ProductCard, ProductPage } from '../commerce/types.ts';
import type { CartJson, ProductDetailsJson, ProductJson, ProductListJson } from './json.ts';
import { listingUrl, type ListingFilters } from './listing-query.ts';
import { productUrl } from './urls.ts';

export function productJson(card: ProductCard): ProductJson {
	return {
		handle: card.handle,
		title: card.title,
		price: formatMoney(card.price),
		compareAtPrice: card.compareAtPrice ? formatMoney(card.compareAtPrice) : null,
		badge: card.badge,
		material: card.material,
		url: productUrl(card),
		thumbnail: card.thumbnail,
	};
}

export function productListJson(page: ProductPage, filters: ListingFilters): ProductListJson {
	return {
		items: page.items.map(productJson),
		total: page.total,
		page: page.page,
		pageCount: page.pageCount,
		facets: page.facets,
		url: listingUrl({ ...filters, page: page.page }),
	};
}

export function productDetailsJson(product: Product): ProductDetailsJson {
	return {
		...productJson(product),
		description: product.description,
		variants: product.variants,
		collection: product.collection.name,
		category: product.category.name,
		subcategory: product.subcategory.name,
	};
}

export function cartJson(cart: Cart): CartJson {
	return {
		itemCount: cart.itemCount,
		lines: cart.lines.map((line) => ({
			variantId: line.variantId,
			handle: line.handle,
			title: line.title,
			variantTitle: line.variantTitle,
			quantity: line.quantity,
			price: formatMoney(line.unitPrice),
			subtotal: formatMoney(line.subtotal),
			url: productUrl(line),
			thumbnail: line.thumbnail,
		})),
		subtotal: formatMoney(cart.subtotal),
	};
}
