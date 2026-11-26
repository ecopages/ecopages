/**
 * Storefront API result shapes, limited to the fields `queries.ts` selects. `MoneyV2`, `Image` and `Collection`
 * select exactly the commerce model's fields, so they are used as they come.
 *
 * @module
 */

import type { Cart, Image, Money, Product, ProductSummary } from '../types';

export interface ShopifyPageInfo {
	hasNextPage: boolean;
	endCursor: string | null;
}

/**
 * One page of a Storefront API connection.
 */
export interface ShopifyConnection<T> {
	nodes: T[];
	pageInfo: ShopifyPageInfo;
}

export interface ShopifyVariant {
	id: string;
	title: string;
	availableForSale: boolean;
	price: Money;
	compareAtPrice: Money | null;
	selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyProductSummary {
	id: string;
	handle: string;
	title: string;
	vendor: string;
	availableForSale: boolean;
	priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
	featuredImage: Image | null;
	productType: string;
	options: Array<{ name: string; optionValues: Array<{ name: string }> }>;
	selectedOrFirstAvailableVariant: { id: string; availableForSale: boolean } | null;
	variantsCount: { count: number } | null;
}

export interface ShopifyProduct extends ShopifyProductSummary {
	description: string;
	tags: string[];
	variants: ShopifyConnection<ShopifyVariant>;
	images: { nodes: Image[] };
}

export interface ShopifyCartLine {
	id: string;
	quantity: number;
	cost: { amountPerQuantity: Money; totalAmount: Money };
	merchandise: {
		id: string;
		title: string;
		image: Image | null;
		product: { handle: string; title: string; featuredImage: Image | null };
	};
}

export interface ShopifyCart {
	id: string;
	checkoutUrl: string;
	totalQuantity: number;
	cost: { subtotalAmount: Money };
	lines: ShopifyConnection<ShopifyCartLine>;
}

export function toProductSummary(product: ShopifyProductSummary): ProductSummary {
	return {
		id: product.id,
		handle: product.handle,
		title: product.title,
		vendor: product.vendor,
		availableForSale: product.availableForSale,
		priceRange: { min: product.priceRange.minVariantPrice, max: product.priceRange.maxVariantPrice },
		featuredImage: product.featuredImage,
		productType: product.productType,
		options: product.options.map((option) => ({
			name: option.name,
			values: option.optionValues.map((value) => value.name),
		})),
		defaultVariantId: product.selectedOrFirstAvailableVariant?.availableForSale
			? product.selectedOrFirstAvailableVariant.id
			: null,
		variantCount: product.variantsCount?.count ?? 0,
	};
}

export function toProduct(product: ShopifyProduct): Product {
	return {
		...toProductSummary(product),
		description: product.description,
		tags: product.tags,
		variants: product.variants.nodes,
		images: product.images.nodes,
	};
}

export function toCart(cart: ShopifyCart): Cart {
	return {
		id: cart.id,
		checkoutUrl: cart.checkoutUrl,
		totalQuantity: cart.totalQuantity,
		subtotal: cart.cost.subtotalAmount,
		lines: cart.lines.nodes.map((line) => ({
			id: line.id,
			quantity: line.quantity,
			variantId: line.merchandise.id,
			variantTitle: line.merchandise.title,
			productHandle: line.merchandise.product.handle,
			productTitle: line.merchandise.product.title,
			unitPrice: line.cost.amountPerQuantity,
			totalPrice: line.cost.totalAmount,
			image: line.merchandise.image ?? line.merchandise.product.featuredImage,
		})),
	};
}
