import { fileSystem, installFileSystem } from '@ecopages/file-system';
import { nodeFs } from '@ecopages/file-system/node';
import { createClient } from '@libsql/client';
import { path } from '@ecopages/file-system/path';
import { count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CATALOG_SIZES, generateCatalog, type CatalogSize } from './seed/generator.ts';
import { createTempDir, migrationsFolder } from './database.fixture.ts';
import { openCatalogDatabase, resolveDatabaseUrl } from './database.server.ts';
import { carts, catalogMeta, products } from './schema.ts';

vi.mock('./seed/generator.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('./seed/generator.ts')>();
	return { ...original, generateCatalog: vi.fn(original.generateCatalog) };
});

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

	test('a file written by another schema is regenerated', async () => {
		fileSystem.ensureDir(path.dirname(filePath));
		const client = createClient({ url: path.toFileUrl(filePath).href });
		await client.execute('CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT)');
		await client.execute(
			'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC)',
		);
		client.close();

		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		const [row] = await db.select({ value: count() }).from(products);
		close();

		expect(row?.value).toBe(productTotal(CATALOG_SIZES.small));
	});

	test('a file another connection holds locked is left in place, with its carts, and the open fails', async () => {
		const first = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		await first.db.insert(carts).values({ id: '00000000-0000-4000-8000-000000000001', updatedAt: Date.now() });
		first.close();
		const holder = createClient({ url: path.toFileUrl(filePath).href });
		await holder.execute('BEGIN EXCLUSIVE');

		try {
			await expect(
				openCatalogDatabase({ url: path.toFileUrl(filePath).href, migrationsFolder, sizeName: 'small' }),
			).rejects.toThrow();
		} finally {
			await holder.execute('ROLLBACK');
			holder.close();
		}

		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		const remaining = await db.select().from(carts);
		close();
		expect(remaining).toHaveLength(1);
	});

	test('reseeding for another size clears the carts', async () => {
		const first = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		await first.db.insert(carts).values({ id: '00000000-0000-4000-8000-000000000000', updatedAt: Date.now() });
		first.close();

		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'medium',
		});
		const remaining = await db.select().from(carts);
		close();

		expect(remaining).toEqual([]);
	});

	test('a seed that fails partway leaves no file in place, and the next open seeds cleanly', async () => {
		vi.mocked(generateCatalog).mockImplementationOnce((size) => {
			const catalog = generateCatalog(size);
			const duplicate = { ...catalog.products[0]!, id: catalog.products.length + 1 };
			return { ...catalog, products: [...catalog.products, duplicate] };
		});

		await expect(
			openCatalogDatabase({
				url: path.toFileUrl(filePath).href,
				migrationsFolder,
				sizeName: 'small',
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

	test('a catalog another process installs while this one seeds is kept, with its carts', async () => {
		const winnerPath = path.join(temp.dir, 'winner.db');
		const winner = await openCatalogDatabase({
			url: path.toFileUrl(winnerPath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		await winner.db.insert(carts).values({ id: '00000000-0000-4000-8000-000000000002', updatedAt: Date.now() });
		winner.close();

		vi.mocked(generateCatalog).mockImplementationOnce((size) => {
			fileSystem.copyFile(winnerPath, filePath);
			return generateCatalog(size);
		});
		const { db, close } = await openCatalogDatabase({
			url: path.toFileUrl(filePath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		const remaining = await db.select().from(carts);
		close();

		expect(remaining).toHaveLength(1);
		expect(fileSystem.readdir(path.dirname(filePath)).map((entry) => entry.name)).toEqual(['catalog.db']);
	});

	test('a catalog another process installs at the instant this one installs is kept, with its carts', async () => {
		const winnerPath = path.join(temp.dir, 'winner.db');
		const winner = await openCatalogDatabase({
			url: path.toFileUrl(winnerPath).href,
			migrationsFolder,
			sizeName: 'small',
		});
		await winner.db.insert(carts).values({ id: '00000000-0000-4000-8000-000000000003', updatedAt: Date.now() });
		winner.close();
		const restore = installFileSystem(
			Object.assign(Object.create(nodeFs), {
				linkNewAsync: async (source: string, destination: string) => {
					nodeFs.copyFile(winnerPath, destination);
					return nodeFs.linkNewAsync(source, destination);
				},
			}),
		);

		try {
			const { db, close } = await openCatalogDatabase({
				url: path.toFileUrl(filePath).href,
				migrationsFolder,
				sizeName: 'small',
			});
			const remaining = await db.select().from(carts);
			close();

			expect(remaining).toHaveLength(1);
		} finally {
			restore();
		}
		expect(fileSystem.readdir(path.dirname(filePath)).map((entry) => entry.name)).toEqual(['catalog.db']);
	});

	test('a link that fails for another reason leaves no temporary file and reports the error', async () => {
		const restore = installFileSystem(
			Object.assign(Object.create(nodeFs), {
				linkNewAsync: async () => {
					throw Object.assign(new Error('input/output error'), { code: 'EIO' });
				},
			}),
		);

		try {
			await expect(
				openCatalogDatabase({ url: path.toFileUrl(filePath).href, migrationsFolder, sizeName: 'small' }),
			).rejects.toThrow('input/output error');
		} finally {
			restore();
		}
		expect(fileSystem.readdir(path.dirname(filePath)).map((entry) => entry.name)).toEqual([]);
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
