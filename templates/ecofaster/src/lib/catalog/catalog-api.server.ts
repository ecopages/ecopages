import type { CatalogDb } from '../db/catalog-database.server.ts';
import type { BrowseResult, PlaceLink, ProductDetails, ProductLink } from './catalog-api.ts';
import { getCategoryPage, getCollectionPage, getProductPage, listCollections } from './queries.server.ts';
import type { ProductSummary } from './types.ts';
import { categoryUrl, collectionUrl, formatPrice, productUrl, subcategoryUrl } from './urls.ts';

export type { BrowseResult, ProductDetails } from './catalog-api.ts';

/** The catalog changes only on regeneration, so answers may be reused for a minute. */
const CATALOG_CACHE = { 'cache-control': 'public, max-age=60' };

function toProductLink(product: ProductSummary): ProductLink {
	return {
		product: product.slug,
		name: product.name,
		price: formatPrice(product.priceCents),
		url: productUrl(product),
	};
}

function place(name: string, slug: string, url: string): PlaceLink {
	return { name, slug, url };
}

function notFound(message: string): Response {
	return Response.json({ error: message }, { status: 404 });
}

async function browse(
	db: CatalogDb,
	{ collection, category }: { collection?: string; category?: string },
): Promise<BrowseResult | Response> {
	if (category && !collection) return Response.json({ error: 'category needs its collection.' }, { status: 400 });

	if (collection && category) {
		const page = await getCategoryPage(db, collection, category);
		if (!page) return notFound(`No category "${category}" in collection "${collection}".`);
		return {
			level: 'category',
			collection: place(page.collection.name, page.collection.slug, collectionUrl(page.collection)),
			category: place(page.category.name, page.category.slug, categoryUrl(page.collection, page.category)),
			subcategories: page.subcategories.map((subcategory) => ({
				...place(
					subcategory.name,
					subcategory.slug,
					subcategoryUrl(page.collection, page.category, subcategory),
				),
				productCount: subcategory.productCount,
				products: subcategory.products.map(toProductLink),
			})),
		};
	}

	if (collection) {
		const page = await getCollectionPage(db, collection);
		if (!page) return notFound(`No collection "${collection}".`);
		return {
			level: 'collection',
			collection: {
				...place(page.collection.name, page.collection.slug, collectionUrl(page.collection)),
				tagline: page.collection.tagline,
			},
			categories: page.categories.map((item) => ({
				...place(item.name, item.slug, categoryUrl(page.collection, item)),
				subcategories: item.subcategories.map((subcategory) =>
					place(subcategory.name, subcategory.slug, subcategoryUrl(page.collection, item, subcategory)),
				),
			})),
		};
	}

	const collections = await listCollections(db);
	return {
		level: 'store',
		collections: collections.map((item) => ({
			...place(item.name, item.slug, collectionUrl(item)),
			categories: item.categories.map((child) => place(child.name, child.slug, categoryUrl(item, child))),
		})),
	};
}

/** `GET /api/browse?collection=&category=`: one level of the catalog, for the `browse_store` agent tool. */
export async function browseCatalogAction(
	db: CatalogDb,
	params: { collection?: string; category?: string },
): Promise<Response> {
	const result = await browse(db, params);
	return result instanceof Response ? result : Response.json(result, { headers: CATALOG_CACHE });
}

/** `GET /api/products/<slug>`: a product's details, for the `get_product` agent tool. */
export async function productDetailsAction(db: CatalogDb, slug: string): Promise<Response> {
	const page = await getProductPage(db, slug);
	if (!page) return notFound(`No product "${slug}".`);
	const details: ProductDetails = {
		...toProductLink(page.product),
		productId: page.product.id,
		description: page.product.description,
		collection: page.collection.name,
		category: page.category.name,
		subcategory: page.subcategory.name,
	};
	return Response.json(details, { headers: CATALOG_CACHE });
}
