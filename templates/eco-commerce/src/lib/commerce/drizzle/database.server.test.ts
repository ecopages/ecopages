import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CATALOG_SIZES, generateCatalog, type CatalogSize } from './seed/generator.ts';
import { createTempDir, migrationsFolder } from './database.fixture.ts';
import { openCatalogDatabase, resolveDatabaseUrl } from './database.server.ts';
import { catalogMeta, products } from './schema.ts';

function productTotal(size: CatalogSize): number {
	return (
		size.collections * size.categoriesPerCollection * size.subcategoriesPerCategory * size.productsPerSubcategory
	);
}

describe('resolveDatabaseUrl', () => {
	test('defaults to a local file in the app folder', () => {
		expect(resolveDatabaseUrl({})).toBe(path.toFileUrl(path.resolve(path.cwd(), '.data/catalog.db')).href);
	});

	test('resolves a relative file URL against the app folder and keeps absolute and remote URLs', () => {
		expect(resolveDatabaseUrl({ DATABASE_URL: 'file:db/store.db' })).toBe(
			path.toFileUrl(path.resolve(path.cwd(), 'db/store.db')).href,
		);
		expect(resolveDatabaseUrl({ DATABASE_URL: 'file:///srv/store.db' })).toBe('file:///srv/store.db');
		expect(resolveDatabaseUrl({ DATABASE_URL: 'libsql://store-acme.turso.io' })).toBe(
			'libsql://store-acme.turso.io',
		);
	});
});

describe('openCatalogDatabase', () => {
	let temp: ReturnType<typeof createTempDir>;
	let filePath: string;

	beforeEach(() => {
		temp = createTempDir();
		filePath = path.join(temp.dir, 'nested', 'catalog.db');
	});

	afterEach(() => temp.remove());

	test('creates and seeds the database when the file is missing', async () => {
		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		const [row] = await db.select({ value: count() }).from(products);
		close();

		expect(fileSystem.exists(filePath)).toBe(true);
		expect(row?.value).toBe(productTotal(CATALOG_SIZES.small));
	});

	test('reuses a database seeded with the same size', async () => {
		const first = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		await first.db.insert(catalogMeta).values({ key: 'marker', value: 'kept' });
		first.close();

		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		const [marker] = await db.select().from(catalogMeta).where(eq(catalogMeta.key, 'marker'));
		close();

		expect(marker?.value).toBe('kept');
	});

	test('regenerates the catalog when the size changes', async () => {
		(
			await openCatalogDatabase({ url: path.toFileUrl(filePath).href, migrationsFolder, sizeName: 'small' })
		).close();

		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'medium',
		});
		const [meta] = await db.select().from(catalogMeta).where(eq(catalogMeta.key, 'size'));
		const [row] = await db.select({ value: count() }).from(products);
		close();

		expect(meta?.value).toBe('medium');
		expect(row?.value).toBe(productTotal(CATALOG_SIZES.medium));
	});

	test('a seed that fails partway leaves no file in place, and the next open seeds cleanly', async () => {
		const broken = () => {
			const catalog = generateCatalog(CATALOG_SIZES.small);
			const duplicate = { ...catalog.products[0]!, id: catalog.products.length + 1 };
			return { ...catalog, products: [...catalog.products, duplicate] };
		};

		await expect(
			openCatalogDatabase({
				url: path.toFileUrl(filePath).href,
				migrationsFolder,
				sizeName: 'small',
				generate: broken,
			}),
		).rejects.toThrow();
		expect(fileSystem.exists(filePath)).toBe(false);
		expect(fileSystem.readdir(path.dirname(filePath)).map((entry) => entry.name)).toEqual([]);

		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		const [row] = await db.select({ value: count() }).from(products);
		close();
		expect(row?.value).toBe(productTotal(CATALOG_SIZES.small));
	});

	test('two concurrent opens of a missing file both end with a seeded database', async () => {
		const [first, second] = await Promise.all([
			openCatalogDatabase({ url: path.toFileUrl(filePath).href, migrationsFolder, sizeName: 'small' }),
			openCatalogDatabase({ url: path.toFileUrl(filePath).href, migrationsFolder, sizeName: 'small' }),
		]);
		const [firstCount] = await first.db.select({ value: count() }).from(products);
		const [secondCount] = await second.db.select({ value: count() }).from(products);
		first.close();
		second.close();

		expect(firstCount?.value).toBe(productTotal(CATALOG_SIZES.small));
		expect(secondCount?.value).toBe(firstCount?.value);
	});
});
