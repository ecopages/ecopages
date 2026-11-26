import { and, asc, count, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type { CatalogDb } from '../db/catalog-database.server.ts';
import {
	categories,
	collections,
	products,
	subcategories,
	type CategoryRow,
	type CollectionRow,
	type SubcategoryRow,
} from '../db/schema.ts';
import type { ProductSummary } from './types.ts';

export type CollectionWithCategories = CollectionRow & { categories: CategoryRow[] };

export type CollectionPage = {
	collection: CollectionRow;
	categories: Array<CategoryRow & { subcategories: SubcategoryRow[] }>;
};

export type CategoryPage = {
	collection: CollectionRow;
	category: CategoryRow;
	subcategories: Array<SubcategoryRow & { productCount: number; products: ProductSummary[] }>;
};

export type SubcategoryPage = {
	collection: CollectionRow;
	category: CategoryRow;
	subcategory: SubcategoryRow;
	products: ProductSummary[];
};

export type ProductPage = {
	collection: CollectionRow;
	category: CategoryRow;
	subcategory: SubcategoryRow;
	product: ProductSummary & { description: string };
	related: ProductSummary[];
};

/** Products a category page previews for each subcategory. */
const CATEGORY_PREVIEW_SIZE = 4;

/** Siblings a product page shows under "More <subcategory>". */
const RELATED_SIZE = 8;

const productSummary = {
	id: products.id,
	slug: products.slug,
	name: products.name,
	priceCents: products.priceCents,
};

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const row of rows) {
		const group = groups.get(key(row));
		if (group) group.push(row);
		else groups.set(key(row), [row]);
	}
	return groups;
}

export async function listCollections(db: CatalogDb): Promise<CollectionWithCategories[]> {
	const [collectionRows, categoryRows] = await Promise.all([
		db.select().from(collections).orderBy(asc(collections.position)),
		db.select().from(categories).orderBy(asc(categories.position)),
	]);
	const byCollection = groupBy(categoryRows, (row) => row.collectionId);
	return collectionRows.map((collection) => ({ ...collection, categories: byCollection.get(collection.id) ?? [] }));
}

export async function getCollectionPage(db: CatalogDb, collectionSlug: string): Promise<CollectionPage | null> {
	const [collection] = await db.select().from(collections).where(eq(collections.slug, collectionSlug));
	if (!collection) return null;

	const categoryRows = await db
		.select()
		.from(categories)
		.where(eq(categories.collectionId, collection.id))
		.orderBy(asc(categories.position));
	const subcategoryRows = categoryRows.length
		? await db
				.select()
				.from(subcategories)
				.where(
					inArray(
						subcategories.categoryId,
						categoryRows.map((row) => row.id),
					),
				)
				.orderBy(asc(subcategories.position))
		: [];
	const byCategory = groupBy(subcategoryRows, (row) => row.categoryId);

	return {
		collection,
		categories: categoryRows.map((category) => ({ ...category, subcategories: byCategory.get(category.id) ?? [] })),
	};
}

async function findCategory(
	db: CatalogDb,
	collectionSlug: string,
	categorySlug: string,
): Promise<{ collection: CollectionRow; category: CategoryRow } | null> {
	const [row] = await db
		.select({ collection: collections, category: categories })
		.from(categories)
		.innerJoin(collections, eq(categories.collectionId, collections.id))
		.where(and(eq(collections.slug, collectionSlug), eq(categories.slug, categorySlug)));
	return row ?? null;
}

export async function getCategoryPage(
	db: CatalogDb,
	collectionSlug: string,
	categorySlug: string,
): Promise<CategoryPage | null> {
	const parents = await findCategory(db, collectionSlug, categorySlug);
	if (!parents) return null;

	const subcategoryRows = await db
		.select({ subcategory: subcategories, productCount: count(products.id) })
		.from(subcategories)
		.leftJoin(products, eq(products.subcategoryId, subcategories.id))
		.where(eq(subcategories.categoryId, parents.category.id))
		.groupBy(subcategories.id)
		.orderBy(asc(subcategories.position));
	const previewRows = subcategoryRows.length
		? await db
				.select({ ...productSummary, subcategoryId: products.subcategoryId })
				.from(products)
				.where(
					and(
						inArray(
							products.subcategoryId,
							subcategoryRows.map((row) => row.subcategory.id),
						),
						lte(products.position, CATEGORY_PREVIEW_SIZE - 1),
					),
				)
				.orderBy(asc(products.position))
		: [];
	const bySubcategory = groupBy(previewRows, (row) => row.subcategoryId);

	return {
		...parents,
		subcategories: subcategoryRows.map(({ subcategory, productCount }) => ({
			...subcategory,
			productCount,
			products: (bySubcategory.get(subcategory.id) ?? []).map(({ subcategoryId: _, ...product }) => product),
		})),
	};
}

export async function getSubcategoryPage(
	db: CatalogDb,
	collectionSlug: string,
	categorySlug: string,
	subcategorySlug: string,
): Promise<SubcategoryPage | null> {
	const parents = await findCategory(db, collectionSlug, categorySlug);
	if (!parents) return null;

	const [subcategory] = await db
		.select()
		.from(subcategories)
		.where(and(eq(subcategories.categoryId, parents.category.id), eq(subcategories.slug, subcategorySlug)));
	if (!subcategory) return null;

	const productRows = await db
		.select(productSummary)
		.from(products)
		.where(eq(products.subcategoryId, subcategory.id))
		.orderBy(asc(products.position));

	return { ...parents, subcategory, products: productRows };
}

export async function getProductPage(db: CatalogDb, productSlug: string): Promise<ProductPage | null> {
	const [row] = await db
		.select({
			product: { ...productSummary, description: products.description },
			subcategory: subcategories,
			category: categories,
			collection: collections,
		})
		.from(products)
		.innerJoin(subcategories, eq(products.subcategoryId, subcategories.id))
		.innerJoin(categories, eq(subcategories.categoryId, categories.id))
		.innerJoin(collections, eq(categories.collectionId, collections.id))
		.where(eq(products.slug, productSlug));
	if (!row) return null;

	const related = await db
		.select(productSummary)
		.from(products)
		.where(and(eq(products.subcategoryId, row.subcategory.id), ne(products.id, row.product.id)))
		.orderBy(asc(products.position))
		.limit(RELATED_SIZE);

	return { ...row, related };
}

export async function getProductsByIds(db: CatalogDb, ids: number[]): Promise<ProductSummary[]> {
	if (ids.length === 0) return [];
	return db.select(productSummary).from(products).where(inArray(products.id, ids));
}

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

/**
 * Finds products whose name contains `query`, names that start with it first.
 *
 * @remarks
 * A `LIKE '%…%'` scan reads every product, which stays fast for the presets here (24,000 products at most). A
 * much larger catalog would add an FTS5 virtual table in a migration and query it instead.
 */
export async function searchProducts(db: CatalogDb, query: string, limit: number): Promise<ProductSummary[]> {
	const term = query.trim();
	if (!term) return [];
	const escaped = escapeLike(term);
	return db
		.select(productSummary)
		.from(products)
		.where(sql`${products.name} LIKE ${`%${escaped}%`} ESCAPE '\\'`)
		.orderBy(sql`${products.name} LIKE ${`${escaped}%`} ESCAPE '\\' DESC`, asc(products.name))
		.limit(limit);
}

export async function listCollectionPaths(db: CatalogDb): Promise<Array<{ collection: string }>> {
	const rows = await db.select({ slug: collections.slug }).from(collections);
	return rows.map((row) => ({ collection: row.slug }));
}

export async function listCategoryPaths(db: CatalogDb): Promise<Array<{ collection: string; category: string }>> {
	return db
		.select({ collection: collections.slug, category: categories.slug })
		.from(categories)
		.innerJoin(collections, eq(categories.collectionId, collections.id));
}

export async function listSubcategoryPaths(
	db: CatalogDb,
): Promise<Array<{ collection: string; category: string; subcategory: string }>> {
	return db
		.select({ collection: collections.slug, category: categories.slug, subcategory: subcategories.slug })
		.from(subcategories)
		.innerJoin(categories, eq(subcategories.categoryId, categories.id))
		.innerJoin(collections, eq(categories.collectionId, collections.id));
}

/** Params of the product pages rendered at build: the first `perSubcategory` products of each subcategory. */
export async function listPrebuiltProductPaths(
	db: CatalogDb,
	perSubcategory: number,
): Promise<Array<{ product: string }>> {
	const rows = await db
		.select({ slug: products.slug })
		.from(products)
		.where(lte(products.position, perSubcategory - 1));
	return rows.map((row) => ({ product: row.slug }));
}
