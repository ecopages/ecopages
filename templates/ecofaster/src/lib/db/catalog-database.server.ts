import { randomUUID } from 'node:crypto';
import { createClient, type Client } from '@libsql/client';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { inArray } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { CATALOG_VERSION, generateCatalog, resolveCatalogSize, type CatalogSizeName } from '../catalog/generator.ts';
import * as schema from './schema.ts';

export type CatalogDb = LibSQLDatabase<typeof schema>;

export type CatalogDatabase = {
	db: CatalogDb;
	close: () => void;
};

export type OpenCatalogDatabaseOptions = {
	filePath: string;
	migrationsFolder: string;
	sizeName: CatalogSizeName;
};

/** Rows per insert statement, well under SQLite's bound-parameter limit for the widest table. */
const INSERT_CHUNK = 500;

function connect(filePath: string): { client: Client; db: CatalogDb } {
	const client = createClient({ url: path.toFileUrl(filePath).href });
	return { client, db: drizzle(client, { schema }) };
}

async function insertInChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
	for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
		await insert(rows.slice(start, start + INSERT_CHUNK));
	}
}

async function isSeededWith(db: CatalogDb, sizeName: CatalogSizeName): Promise<boolean> {
	const rows = await db
		.select()
		.from(schema.catalogMeta)
		.where(inArray(schema.catalogMeta.key, ['size', 'version']));
	const meta = new Map(rows.map((row) => [row.key, row.value]));
	return meta.get('size') === sizeName && meta.get('version') === String(CATALOG_VERSION);
}

/**
 * Writes a fresh catalog to `filePath` through a temporary file in the same folder.
 *
 * @remarks
 * The rename is atomic, so a reader never sees a half-seeded database. Two processes that seed at once, such
 * as a dev server and a build, each write their own temporary file; the last rename wins with identical content.
 */
async function writeCatalog({ filePath, migrationsFolder, sizeName }: OpenCatalogDatabaseOptions): Promise<void> {
	fileSystem.ensureDir(path.dirname(filePath));
	const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
	const { client, db } = connect(temporaryPath);
	let seeded = false;
	try {
		await migrate(db, { migrationsFolder });
		const catalog = generateCatalog(resolveCatalogSize(sizeName).size);
		await db.transaction(async (tx) => {
			await insertInChunks(catalog.collections, (chunk) => tx.insert(schema.collections).values(chunk));
			await insertInChunks(catalog.categories, (chunk) => tx.insert(schema.categories).values(chunk));
			await insertInChunks(catalog.subcategories, (chunk) => tx.insert(schema.subcategories).values(chunk));
			await insertInChunks(catalog.products, (chunk) => tx.insert(schema.products).values(chunk));
			await tx.insert(schema.catalogMeta).values([
				{ key: 'size', value: sizeName },
				{ key: 'version', value: String(CATALOG_VERSION) },
			]);
		});
		seeded = true;
	} finally {
		client.close();
		if (!seeded) fileSystem.remove(temporaryPath);
	}
	fileSystem.rename(temporaryPath, filePath);
}

/**
 * Opens the catalog database, creating and seeding it first when needed.
 *
 * @remarks
 * Seeds when the file is missing or was seeded with another size or generator version, so changing
 * `CATALOG_SIZE` takes effect on the next start. Pending migrations run on every open.
 */
export async function openCatalogDatabase(options: OpenCatalogDatabaseOptions): Promise<CatalogDatabase> {
	if (fileSystem.exists(options.filePath)) {
		const existing = connect(options.filePath);
		await migrate(existing.db, { migrationsFolder: options.migrationsFolder });
		if (await isSeededWith(existing.db, options.sizeName)) {
			return { db: existing.db, close: () => existing.client.close() };
		}
		existing.client.close();
	}

	await writeCatalog(options);
	const fresh = connect(options.filePath);
	return { db: fresh.db, close: () => fresh.client.close() };
}

const REGISTRY_KEY = Symbol.for('ecofaster.catalog-database');

type RegistryHolder = { [REGISTRY_KEY]?: Map<string, Promise<CatalogDatabase>> };

/**
 * Resolves the database file from `CATALOG_DB_PATH`, relative to the app root.
 *
 * @remarks
 * The app root is the working directory, as for `eco.config.ts`: the production server runs from a bundle in
 * `dist/server/`, where a path relative to this module would point inside the build output.
 */
export function resolveCatalogDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
	return path.resolve(path.cwd(), env.CATALOG_DB_PATH || '.data/catalog.db');
}

/**
 * Returns the app's catalog database, opened once per process.
 *
 * @remarks
 * The registry lives on `globalThis` because the server entry, Page modules and Endpoint modules can each load
 * their own copy of this module; sharing it keeps one client and one seeding run per database file.
 */
export function getCatalogDb(): Promise<CatalogDb> {
	const filePath = resolveCatalogDatabasePath();
	const registry = ((globalThis as RegistryHolder)[REGISTRY_KEY] ??= new Map<string, Promise<CatalogDatabase>>());
	let pending = registry.get(filePath);
	if (!pending) {
		pending = openCatalogDatabase({
			filePath,
			migrationsFolder: path.resolve(path.cwd(), 'drizzle'),
			sizeName: resolveCatalogSize(process.env.CATALOG_SIZE).name,
		});
		pending.catch(() => registry.delete(filePath));
		registry.set(filePath, pending);
	}
	return pending.then(({ db }) => db);
}
