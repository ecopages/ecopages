export type CatalogSize = {
	collections: number;
	categoriesPerCollection: number;
	subcategoriesPerCategory: number;
	productsPerSubcategory: number;
	/**
	 * Product pages rendered at build in each subcategory.
	 *
	 * @remarks
	 * The rest render on their first request and are cached like the prebuilt ones, which keeps large catalogs
	 * quick to build.
	 */
	prebuiltProductsPerSubcategory: number;
	/** Listing pages rendered at build in each subcategory; later pages render on their first request. */
	prebuiltListingPagesPerSubcategory: number;
};

export type CatalogSizeName = 'small' | 'medium' | 'large';

/** Products on one subcategory listing page. */
export const LISTING_PAGE_SIZE = 24;

export const CATALOG_SIZES: Record<CatalogSizeName, CatalogSize> = {
	small: {
		collections: 3,
		categoriesPerCollection: 3,
		subcategoriesPerCategory: 3,
		productsPerSubcategory: 4,
		prebuiltProductsPerSubcategory: 4,
		prebuiltListingPagesPerSubcategory: 1,
	},
	medium: {
		collections: 6,
		categoriesPerCollection: 4,
		subcategoriesPerCategory: 4,
		productsPerSubcategory: 36,
		prebuiltProductsPerSubcategory: 4,
		prebuiltListingPagesPerSubcategory: 2,
	},
	large: {
		collections: 6,
		categoriesPerCollection: 4,
		subcategoriesPerCategory: 4,
		productsPerSubcategory: 250,
		prebuiltProductsPerSubcategory: 1,
		prebuiltListingPagesPerSubcategory: 1,
	},
};

/** The preset a missing or empty `CATALOG_SIZE` picks: big enough that listings look full, quick enough for CI. */
export const DEFAULT_CATALOG_SIZE: CatalogSizeName = 'medium';

function isCatalogSizeName(name: string): name is CatalogSizeName {
	return Object.hasOwn(CATALOG_SIZES, name);
}

/** Reads a size preset name, as set in `CATALOG_SIZE`. */
export function resolveCatalogSize(value: string | undefined): { name: CatalogSizeName; size: CatalogSize } {
	const name = value?.trim().toLowerCase() || DEFAULT_CATALOG_SIZE;
	if (!isCatalogSizeName(name)) {
		throw new Error(`Unknown catalog size "${value}". Use one of: ${Object.keys(CATALOG_SIZES).join(', ')}.`);
	}
	return { name, size: CATALOG_SIZES[name] };
}
