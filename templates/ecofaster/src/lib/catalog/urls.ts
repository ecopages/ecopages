type Slugged = { slug: string };

export function collectionUrl(collection: Slugged): string {
	return `/collections/${collection.slug}`;
}

export function categoryUrl(collection: Slugged, category: Slugged): string {
	return `${collectionUrl(collection)}/${category.slug}`;
}

export function subcategoryUrl(collection: Slugged, category: Slugged, subcategory: Slugged): string {
	return `${categoryUrl(collection, category)}/${subcategory.slug}`;
}

export function productUrl(product: Slugged): string {
	return `/products/${product.slug}`;
}

/**
 * The generated placeholder image of a product.
 *
 * @remarks
 * Listings and the product page use this same URL, so the image a visitor saw on a card is already in the
 * browser cache when the product page opens.
 */
export function productImageUrl(product: Slugged): string {
	return `/images/products/${product.slug}`;
}

const priceFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatPrice(cents: number): string {
	return priceFormat.format(cents / 100);
}
