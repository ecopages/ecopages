import { and, asc, count, eq, inArray, lte, ne } from 'drizzle-orm';
import type { CatalogBackend } from '../backend.ts';
import type { CategoryDetail, Place, Product, ProductCard, StoreTree, SubcategorySummary } from '../types.ts';
import type { CatalogDb } from './database.server.ts';
import { listProducts } from './listing.server.ts';
import { productCardColumns, thumbnailUrl, toPlace, toProductCard, toVariants } from './mappers.ts';
import { categories, collections, products, subcategories } from './schema.ts';

/** Products a category page previews for each subcategory. */
const CATEGORY_PREVIEW_SIZE = 6;

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const row of rows) {
		const group = groups.get(key(row));
		if (group) group.push(row);
		else groups.set(key(row), [row]);
	}
	return groups;
}

/**
 * Every subcategory with its product count and the image of its first product.
 *
 * @remarks
 * One grouped query for the whole tree, or for one category's subcategories, so a page costs the same few
 * queries however large the catalog is. The thumbnail query reads `products_subcategory_idx`.
 */
async function subcategorySummaries(
	db: CatalogDb,
	categoryId?: number,
): Promise<Map<number, SubcategorySummary & { categoryId: number }>> {
	const rows = await db
		.select({
			id: subcategories.id,
			slug: subcategories.slug,
			name: subcategories.name,
			categoryId: subcategories.categoryId,
			productCount: count(products.id),
		})
		.from(subcategories)
		.leftJoin(products, eq(products.subcategoryId, subcategories.id))
		.where(categoryId === undefined ? undefined : eq(subcategories.categoryId, categoryId))
		.groupBy(subcategories.id)
		.orderBy(asc(subcategories.position));
	const firstProducts = rows.length
		? await db
				.select({ subcategoryId: products.subcategoryId, slug: products.slug })
				.from(products)
				.where(
					and(
						inArray(
							products.subcategoryId,
							rows.map((row) => row.id),
						),
						eq(products.position, 0),
					),
				)
		: [];
	const thumbnails = new Map(firstProducts.map((row) => [row.subcategoryId, thumbnailUrl(row.slug)]));
	return new Map(
		rows.map((row) => [
			row.id,
			{
				...toPlace(row),
				categoryId: row.categoryId,
				productCount: row.productCount,
				thumbnail: thumbnails.get(row.id) ?? '',
			},
		]),
	);
}

async function getStoreTree(db: CatalogDb): Promise<StoreTree> {
	const [collectionRows, categoryRows, summaries] = await Promise.all([
		db.select().from(collections).orderBy(asc(collections.position)),
		db.select().from(categories).orderBy(asc(categories.position)),
		subcategorySummaries(db),
	]);
	const subcategoriesByCategory = groupBy([...summaries.values()], (row) => row.categoryId);
	const categoriesByCollection = groupBy(categoryRows, (row) => row.collectionId);
	return collectionRows.map((collection) => ({
		...toPlace(collection),
		tagline: collection.tagline,
		categories: (categoriesByCollection.get(collection.id) ?? []).map((category) => ({
			...toPlace(category),
			subcategories: (subcategoriesByCategory.get(category.id) ?? []).map(({ categoryId: _, ...rest }) => rest),
		})),
	}));
}

async function findCategory(
	db: CatalogDb,
	collection: string,
	category: string,
): Promise<{ collection: Place; category: Place; categoryId: number } | null> {
	const [row] = await db
		.select({ collection: collections, category: categories })
		.from(categories)
		.innerJoin(collections, eq(categories.collectionId, collections.id))
		.where(and(eq(collections.slug, collection), eq(categories.slug, category)));
	return row
		? { collection: toPlace(row.collection), category: toPlace(row.category), categoryId: row.category.id }
		: null;
}

async function getCategory(db: CatalogDb, collection: string, category: string): Promise<CategoryDetail | null> {
	const parents = await findCategory(db, collection, category);
	if (!parents) return null;
	const summaries = [...(await subcategorySummaries(db, parents.categoryId)).values()];
	const previews = summaries.length
		? await db
				.select({ ...productCardColumns, subcategoryId: products.subcategoryId })
				.from(products)
				.where(
					and(
						inArray(
							products.subcategoryId,
							summaries.map((row) => Number(row.id)),
						),
						lte(products.position, CATEGORY_PREVIEW_SIZE - 1),
					),
				)
				.orderBy(asc(products.position))
		: [];
	const previewsBySubcategory = groupBy(previews, (row) => row.subcategoryId);
	return {
		collection: parents.collection,
		category: parents.category,
		subcategories: summaries.map(({ categoryId: _, ...summary }) => ({
			...summary,
			products: (previewsBySubcategory.get(Number(summary.id)) ?? []).map(toProductCard),
		})),
	};
}

async function getProduct(db: CatalogDb, handle: string): Promise<Product | null> {
	const [row] = await db
		.select({ product: products, subcategory: subcategories, category: categories, collection: collections })
		.from(products)
		.innerJoin(subcategories, eq(products.subcategoryId, subcategories.id))
		.innerJoin(categories, eq(subcategories.categoryId, categories.id))
		.innerJoin(collections, eq(categories.collectionId, collections.id))
		.where(eq(products.slug, handle));
	if (!row) return null;
	return {
		...toProductCard(row.product),
		description: row.product.description,
		variants: toVariants(row.product.id, row.product.finishes),
		collection: toPlace(row.collection),
		category: toPlace(row.category),
		subcategory: toPlace(row.subcategory),
	};
}

async function getRelatedProducts(db: CatalogDb, handle: string, limit: number): Promise<ProductCard[]> {
	const [product] = await db
		.select({ id: products.id, subcategoryId: products.subcategoryId, categoryId: subcategories.categoryId })
		.from(products)
		.innerJoin(subcategories, eq(products.subcategoryId, subcategories.id))
		.where(eq(products.slug, handle));
	if (!product) return [];
	const siblings = await db
		.select(productCardColumns)
		.from(products)
		.where(and(eq(products.subcategoryId, product.subcategoryId), ne(products.id, product.id)))
		.orderBy(asc(products.position))
		.limit(limit);
	if (siblings.length >= limit) return siblings.map(toProductCard);
	const cousins = await db
		.select(productCardColumns)
		.from(products)
		.innerJoin(subcategories, eq(products.subcategoryId, subcategories.id))
		.where(and(eq(subcategories.categoryId, product.categoryId), ne(products.subcategoryId, product.subcategoryId)))
		.orderBy(asc(products.position), asc(products.id))
		.limit(limit - siblings.length);
	return [...siblings, ...cousins].map(toProductCard);
}

/** The catalog reads of the Drizzle adapter. */
export function createDrizzleCatalog(getDb: () => Promise<CatalogDb>): CatalogBackend {
	return {
		getStoreTree: async () => getStoreTree(await getDb()),
		getCollection: async (collection) =>
			(await getStoreTree(await getDb())).find((item) => item.handle === collection) ?? null,
		getCategory: async (collection, category) => getCategory(await getDb(), collection, category),
		getSubcategory: async (collection, category, subcategory) => {
			const db = await getDb();
			const parents = await findCategory(db, collection, category);
			if (!parents) return null;
			const summary = [...(await subcategorySummaries(db, parents.categoryId)).values()].find(
				(row) => row.handle === subcategory,
			);
			if (!summary) return null;
			const { categoryId: _, ...rest } = summary;
			return { collection: parents.collection, category: parents.category, subcategory: rest };
		},
		listProducts: async (query) => listProducts(await getDb(), query),
		getProduct: async (handle) => getProduct(await getDb(), handle),
		getRelatedProducts: async (handle, limit) => getRelatedProducts(await getDb(), handle, limit),
		listCatalogPaths: async () => {
			const tree = await getStoreTree(await getDb());
			return {
				collections: tree.map((collection) => ({ collection: collection.handle })),
				categories: tree.flatMap((collection) =>
					collection.categories.map((category) => ({
						collection: collection.handle,
						category: category.handle,
					})),
				),
				subcategories: tree.flatMap((collection) =>
					collection.categories.flatMap((category) =>
						category.subcategories.map((subcategory) => ({
							collection: collection.handle,
							category: category.handle,
							subcategory: subcategory.handle,
							productCount: subcategory.productCount,
						})),
					),
				),
			};
		},
		listFeaturedProductHandles: async (perSubcategory) => {
			const rows = await (
				await getDb()
			)
				.select({ slug: products.slug })
				.from(products)
				.where(lte(products.position, perSubcategory - 1));
			return rows.map((row) => row.slug);
		},
	};
}
