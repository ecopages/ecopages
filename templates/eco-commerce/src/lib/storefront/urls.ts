type Handle = { handle: string };

export function collectionUrl(collection: Handle): string {
	return `/collections/${collection.handle}`;
}

export function categoryUrl(collection: Handle, category: Handle): string {
	return `${collectionUrl(collection)}/${category.handle}`;
}

/** A subcategory listing; page 1 is the subcategory's own URL. */
export function subcategoryUrl(collection: Handle, category: Handle, subcategory: Handle, page = 1): string {
	const base = `${categoryUrl(collection, category)}/${subcategory.handle}`;
	return page > 1 ? `${base}/page/${page}` : base;
}

export function productUrl(product: Handle): string {
	return `/products/${product.handle}`;
}
