/**
 * The JSON shapes the storefront's Endpoints answer with, read by the browser hosts and the agent tools.
 *
 * @remarks
 * Prices arrive formatted and links absolute to the site, so a reader needs no catalog knowledge. They carry
 * only what a visitor sees on the page.
 */

export type ProductJson = {
	handle: string;
	title: string;
	price: string;
	compareAtPrice: string | null;
	badge: 'new' | 'sale' | null;
	material: string;
	url: string;
	thumbnail: string;
};

export type ProductListJson = {
	items: ProductJson[];
	total: number;
	page: number;
	pageCount: number;
	facets: { materials: string[]; finishes: string[] };
	/** The search page that shows this listing. */
	url: string;
};

export type ProductDetailsJson = ProductJson & {
	description: string;
	variants: Array<{ id: string; title: string }>;
	collection: string;
	category: string;
	subcategory: string;
};

export type PlaceJson = { name: string; handle: string; url: string };

export type BrowseJson =
	| { level: 'store'; collections: Array<PlaceJson & { categories: PlaceJson[] }> }
	| { level: 'collection'; collection: PlaceJson; categories: Array<PlaceJson & { subcategories: PlaceJson[] }> }
	| {
			level: 'category';
			collection: PlaceJson;
			category: PlaceJson;
			subcategories: Array<PlaceJson & { productCount: number; products: ProductJson[] }>;
	  };

export type CartLineJson = {
	variantId: string;
	handle: string;
	title: string;
	variantTitle: string;
	quantity: number;
	price: string;
	subtotal: string;
	url: string;
	thumbnail: string;
};

export type CartJson = {
	itemCount: number;
	lines: CartLineJson[];
	subtotal: string;
};
