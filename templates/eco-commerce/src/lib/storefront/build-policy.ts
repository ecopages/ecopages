/**
 * How much of the catalog the build renders ahead of time; everything else renders on first request and is then
 * cached.
 *
 * @remarks
 * Product pages and later listing pages use `cache: { revalidate }`, which renders a page whose Params are not in
 * `paths` on its first request. Rendering only the first few at build keeps a large catalog quick to build.
 * Override the defaults with `PREBUILT_PRODUCTS_PER_SUBCATEGORY` and `PREBUILT_LISTING_PAGES`.
 */
export type BuildPolicy = {
	/** Product pages rendered at build in each subcategory, from the first. */
	productsPerSubcategory: number;
	/** Listing pages rendered at build in each subcategory, the first included. */
	listingPagesPerSubcategory: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
	const number = Number(value);
	return Number.isSafeInteger(number) && number >= 1 ? number : fallback;
}

export function resolveBuildPolicy(env: NodeJS.ProcessEnv = process.env): BuildPolicy {
	return {
		productsPerSubcategory: positiveInteger(env.PREBUILT_PRODUCTS_PER_SUBCATEGORY, 4),
		listingPagesPerSubcategory: positiveInteger(env.PREBUILT_LISTING_PAGES, 2),
	};
}
