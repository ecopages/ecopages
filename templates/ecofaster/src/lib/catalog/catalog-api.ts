/** A product as the JSON catalog responses list it. */
export type ProductLink = {
	/** The product's slug. */
	product: string;
	name: string;
	price: string;
	url: string;
};

export type PlaceLink = {
	name: string;
	slug: string;
	url: string;
};

/** `GET /api/browse`: one level of the catalog, chosen by the `collection` and `category` Query values. */
export type BrowseResult =
	| { level: 'store'; collections: Array<PlaceLink & { categories: PlaceLink[] }> }
	| {
			level: 'collection';
			collection: PlaceLink & { tagline: string };
			categories: Array<PlaceLink & { subcategories: PlaceLink[] }>;
	  }
	| {
			level: 'category';
			collection: PlaceLink;
			category: PlaceLink;
			subcategories: Array<PlaceLink & { productCount: number; products: ProductLink[] }>;
	  };

/** `GET /api/products/<slug>`: what an agent needs to describe or add a product. */
export type ProductDetails = ProductLink & {
	productId: number;
	description: string;
	collection: string;
	category: string;
	subcategory: string;
};
