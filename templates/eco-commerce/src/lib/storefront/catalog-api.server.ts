import type { CatalogBackend } from '../commerce/backend.ts';
import type { Place } from '../commerce/types.ts';
import type { BrowseJson, PlaceJson } from './json.ts';
import { productDetailsJson, productJson } from './to-json.ts';
import { categoryUrl, collectionUrl, subcategoryUrl } from './urls.ts';

/** The catalog changes only on regeneration, so answers may be reused for a minute. */
const CATALOG_CACHE = { 'cache-control': 'public, max-age=60' };

function placeJson(place: Place, url: string): PlaceJson {
	return { name: place.name, handle: place.handle, url };
}

function notFound(message: string): Response {
	return Response.json({ error: message }, { status: 404 });
}

async function browse(
	catalog: CatalogBackend,
	{ collection, category }: { collection?: string; category?: string },
): Promise<BrowseJson | Response> {
	if (category && !collection) return Response.json({ error: 'category needs its collection.' }, { status: 400 });

	if (collection && category) {
		const detail = await catalog.getCategory(collection, category);
		if (!detail) return notFound(`No category "${category}" in collection "${collection}".`);
		return {
			level: 'category',
			collection: placeJson(detail.collection, collectionUrl(detail.collection)),
			category: placeJson(detail.category, categoryUrl(detail.collection, detail.category)),
			subcategories: detail.subcategories.map((item) => ({
				...placeJson(item, subcategoryUrl(detail.collection, detail.category, item)),
				productCount: item.productCount,
				products: item.products.map(productJson),
			})),
		};
	}

	if (collection) {
		const detail = await catalog.getCollection(collection);
		if (!detail) return notFound(`No collection "${collection}".`);
		return {
			level: 'collection',
			collection: placeJson(detail, collectionUrl(detail)),
			categories: detail.categories.map((item) => ({
				...placeJson(item, categoryUrl(detail, item)),
				subcategories: item.subcategories.map((child) => placeJson(child, subcategoryUrl(detail, item, child))),
			})),
		};
	}

	const tree = await catalog.getStoreTree();
	return {
		level: 'store',
		collections: tree.map((item) => ({
			...placeJson(item, collectionUrl(item)),
			categories: item.categories.map((child) => placeJson(child, categoryUrl(item, child))),
		})),
	};
}

/** `GET /api/browse?collection=&category=`: one level of the catalog, for the `browse_store` agent tool. */
export async function browseCatalogAction(
	catalog: CatalogBackend,
	params: { collection?: string; category?: string },
): Promise<Response> {
	const result = await browse(catalog, params);
	return result instanceof Response ? result : Response.json(result, { headers: CATALOG_CACHE });
}

/** `GET /api/products/<handle>`: a product's details and variants, for the `get_product` agent tool. */
export async function productDetailsAction(catalog: CatalogBackend, handle: string): Promise<Response> {
	const product = await catalog.getProduct(handle);
	if (!product) return notFound(`No product "${handle}".`);
	return Response.json(productDetailsJson(product), { headers: CATALOG_CACHE });
}
