import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CATALOG_SIZES, type CatalogSize } from '../catalog/generator.ts';
import { createTempDir, migrationsFolder } from './catalog-database.fixture.ts';
import { openCatalogDatabase } from './catalog-database.server.ts';
import { catalogMeta, products } from './schema.ts';

function productTotal(size: CatalogSize): number {
	return (
		size.collections * size.categoriesPerCollection * size.subcategoriesPerCategory * size.productsPerSubcategory
	);
}

describe('openCatalogDatabase', () => {
	let temp: ReturnType<typeof createTempDir>;
	let filePath: string;

	beforeEach(() => {
		temp = createTempDir();
		filePath = path.join(temp.dir, 'nested', 'catalog.db');
	});

	afterEach(() => temp.remove());

	test('creates and seeds the database when the file is missing', async () => {
		const { db, close } = await openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'small' });
		const [row] = await db.select({ value: count() }).from(products);
		close();

		expect(fileSystem.exists(filePath)).toBe(true);
		expect(row?.value).toBe(productTotal(CATALOG_SIZES.small));
	});

	test('reuses a database seeded with the same size', async () => {
		const first = await openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'small' });
		await first.db.insert(catalogMeta).values({ key: 'marker', value: 'kept' });
		first.close();

		const { db, close } = await openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'small' });
		const [marker] = await db.select().from(catalogMeta).where(eq(catalogMeta.key, 'marker'));
		close();

		expect(marker?.value).toBe('kept');
	});

	test('regenerates the catalog when the size changes', async () => {
		(await openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'small' })).close();

		const { db, close } = await openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'medium' });
		const [meta] = await db.select().from(catalogMeta).where(eq(catalogMeta.key, 'size'));
		const [row] = await db.select({ value: count() }).from(products);
		close();

		expect(meta?.value).toBe('medium');
		expect(row?.value).toBe(productTotal(CATALOG_SIZES.medium));
	});

	test('two concurrent opens of a missing file both end with a seeded database', async () => {
		const [first, second] = await Promise.all([
			openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'small' }),
			openCatalogDatabase({ filePath, migrationsFolder, sizeName: 'small' }),
		]);
		const [firstCount] = await first.db.select({ value: count() }).from(products);
		const [secondCount] = await second.db.select({ value: count() }).from(products);
		first.close();
		second.close();

		expect(firstCount?.value).toBe(productTotal(CATALOG_SIZES.small));
		expect(secondCount?.value).toBe(firstCount?.value);
	});
});
