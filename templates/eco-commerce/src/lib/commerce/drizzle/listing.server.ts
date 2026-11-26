import { and, asc, count, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { ProductPage, ProductQuery } from '../types.ts';
import type { CatalogDb } from './database.server.ts';
import { productCardColumns, toProductCard } from './mappers.ts';
import { products, subcategories } from './schema.ts';
import { emptyProductPage } from '../product-page.ts';

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function containsTitle(term: string): SQL {
	return sql`${products.name} LIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`;
}

function startsTitle(term: string): SQL {
	return sql`${products.name} LIKE ${`${escapeLike(term)}%`} ESCAPE '\\'`;
}

/** Whether the product offers `finish`; `finishes` is a comma-separated list. */
function hasFinish(finish: string): SQL {
	return sql`(',' || ${products.finishes} || ',') LIKE ${`%,${escapeLike(finish)},%`} ESCAPE '\\'`;
}

async function scopeConditions(db: CatalogDb, query: ProductQuery): Promise<SQL[] | null> {
	const conditions: SQL[] = [];
	const term = query.search?.trim();
	if (term) conditions.push(containsTitle(term));
	if (query.subcategory) {
		const [row] = await db
			.select({ id: subcategories.id })
			.from(subcategories)
			.where(eq(subcategories.slug, query.subcategory));
		if (!row) return null;
		conditions.push(eq(products.subcategoryId, row.id));
	}
	if (query.badge) conditions.push(eq(products.badge, query.badge));
	return conditions;
}

function filterConditions(query: ProductQuery): SQL[] {
	const conditions: SQL[] = [];
	if (query.materials?.length) conditions.push(inArray(products.material, query.materials));
	if (query.finishes?.length) conditions.push(or(...query.finishes.map(hasFinish))!);
	if (query.minPrice !== undefined) conditions.push(gte(products.priceCents, query.minPrice));
	if (query.maxPrice !== undefined) conditions.push(lte(products.priceCents, query.maxPrice));
	return conditions;
}

function ordering(query: ProductQuery): SQL[] {
	const term = query.search?.trim();
	switch (query.sort) {
		case 'price-asc':
			return [asc(products.priceCents), asc(products.id)];
		case 'price-desc':
			return [desc(products.priceCents), desc(products.id)];
		case 'name':
			return [asc(products.name)];
		default:
			return term
				? [sql`${startsTitle(term)} DESC`, asc(products.name)]
				: [asc(products.position), asc(products.id)];
	}
}

/** The materials and finishes found in the scope, before the filters apply, for the filter form. */
async function facets(db: CatalogDb, scope: SQL[]): Promise<ProductPage['facets']> {
	const rows = await db
		.selectDistinct({ material: products.material, finishes: products.finishes })
		.from(products)
		.where(and(...scope));
	const materials = new Set<string>();
	const finishes = new Set<string>();
	for (const row of rows) {
		materials.add(row.material);
		for (const finish of row.finishes.split(',')) finishes.add(finish);
	}
	return { materials: [...materials].sort(), finishes: [...finishes].sort() };
}

/**
 * Lists products for a scope, filters, sort and page.
 *
 * @remarks
 * Title search is a `LIKE '%…%'` scan, which stays fast for the presets here (24,000 products at most). A much
 * larger catalog would add an FTS5 virtual table in a migration and query it instead.
 */
export async function listProducts(db: CatalogDb, query: ProductQuery): Promise<ProductPage> {
	const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
	const scope = await scopeConditions(db, query);
	if (!scope) return emptyProductPage();

	const where = and(...scope, ...filterConditions(query));
	const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(products).where(where);
	const pageCount = Math.ceil(total / pageSize);
	const page = Math.min(Math.max(query.page ?? 1, 1), Math.max(pageCount, 1));
	const rows = await db
		.select(productCardColumns)
		.from(products)
		.where(where)
		.orderBy(...ordering(query))
		.limit(pageSize)
		.offset((page - 1) * pageSize);

	return { items: rows.map(toProductCard), total, page, pageCount, facets: await facets(db, scope) };
}
