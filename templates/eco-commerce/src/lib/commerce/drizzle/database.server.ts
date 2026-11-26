import { randomUUID } from 'node:crypto';
import { createClient, type Client } from '@libsql/client';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { inArray } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema.ts';
import {
	CATALOG_VERSION,
	generateCatalog,
	resolveCatalogSize,
	type CatalogSizeName,
	type GeneratedCatalog,
} from './seed/generator.ts';

export type CatalogDb = LibSQLDatabase<typeof schema>;

export type CatalogDatabase = {
	db: CatalogDb;
	close: () => void;
};

export type OpenCatalogDatabaseOptions = {
	/** A libSQL URL: `file:` for a local file, or `libsql://` / `https://` for a remote database such as Turso. */
	url: string;
	authToken?: string;
	migrationsFolder: string;
	sizeName: CatalogSizeName;
	/**
	 * Builds the rows to seed. Defaults to the generated demo catalog for `sizeName`; pass your own to seed real
	 * data.
	 */
	generate?: (sizeName: CatalogSizeName) => GeneratedCatalog;
};

/** Rows per insert statement, well under SQLite's bound-parameter limit for the widest table. */
const INSERT_CHUNK = 500;

/** Where the migrations live, relative to the app root. */
const MIGRATIONS_FOLDER = 'src/lib/commerce/drizzle/migrations';

function connect(url: string, authToken?: string): { client: Client; db: CatalogDb } {
	const client = createClient({ url, authToken });
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

/** Replaces every catalog row with a freshly generated catalog, in one transaction. */
async function seed(
	db: CatalogDb,
	{ sizeName, generate }: Pick<OpenCatalogDatabaseOptions, 'sizeName' | 'generate'>,
): Promise<void> {
	const catalog = generate ? generate(sizeName) : generateCatalog(resolveCatalogSize(sizeName).size);
	await db.transaction(async (tx) => {
		await tx.delete(schema.cartLines);
		await tx.delete(schema.carts);
		await tx.delete(schema.products);
		await tx.delete(schema.subcategories);
		await tx.delete(schema.categories);
		await tx.delete(schema.collections);
		await tx.delete(schema.catalogMeta);
		await insertInChunks(catalog.collections, (chunk) => tx.insert(schema.collections).values(chunk));
		await insertInChunks(catalog.categories, (chunk) => tx.insert(schema.categories).values(chunk));
		await insertInChunks(catalog.subcategories, (chunk) => tx.insert(schema.subcategories).values(chunk));
		await insertInChunks(catalog.products, (chunk) => tx.insert(schema.products).values(chunk));
		await tx.insert(schema.catalogMeta).values([
			{ key: 'size', value: sizeName },
			{ key: 'version', value: String(CATALOG_VERSION) },
		]);
	});
}

/**
 * Writes a fresh catalog to a local file through a temporary file in the same folder.
 *
 * @remarks
 * The rename is atomic, so a reader never sees a half-seeded database. Two processes that seed at once, such
 * as a dev server and a build, each write their own temporary file. A process that finds a current catalog
 * already in place when its own seed is done keeps that file, which may hold carts by then, and drops its own.
 */
async function writeCatalogFile(filePath: string, options: OpenCatalogDatabaseOptions): Promise<void> {
	fileSystem.ensureDir(path.dirname(filePath));
	const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
	const { client, db } = connect(path.toFileUrl(temporaryPath).href);
	let seeded = false;
	try {
		await migrate(db, { migrationsFolder: options.migrationsFolder });
		await seed(db, options);
		seeded = true;
	} finally {
		client.close();
		if (!seeded) fileSystem.remove(temporaryPath);
	}
	if (await holdsCurrentCatalog(filePath, options)) {
		fileSystem.remove(temporaryPath);
		return;
	}
	fileSystem.rename(temporaryPath, filePath);
}

async function holdsCurrentCatalog(filePath: string, options: OpenCatalogDatabaseOptions): Promise<boolean> {
	if (!fileSystem.exists(filePath)) return false;
	const { client, db } = connect(path.toFileUrl(filePath).href);
	try {
		return await isCurrent(db, options);
	} finally {
		client.close();
	}
}

/** SQLite errors that mean another connection holds the file, not that the file is stale. */
const LOCK_ERRORS = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED']);

function errorCode(error: unknown): unknown {
	return error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
}

/** Whether `error`, or the error a Drizzle wrapper keeps as its `cause`, is a lock held by another connection. */
function isLockError(error: unknown): boolean {
	const cause = error instanceof Error ? error.cause : undefined;
	return [errorCode(error), errorCode(cause)].some((code) => typeof code === 'string' && LOCK_ERRORS.has(code));
}

/**
 * Whether a local file holds the current schema and catalog.
 *
 * @remarks
 * A migration that fails because the file was written by another schema makes the file stale, so it is
 * regenerated. A lock held by another process is rethrown instead: regenerating then would drop the carts of a
 * file that is fine.
 */
async function isCurrent(db: CatalogDb, options: OpenCatalogDatabaseOptions): Promise<boolean> {
	try {
		await migrate(db, { migrationsFolder: options.migrationsFolder });
	} catch (error) {
		if (isLockError(error)) throw error;
		return false;
	}
	return isSeededWith(db, options.sizeName);
}

/**
 * Opens the catalog database, creating and seeding it first when needed.
 *
 * @remarks
 * Seeds when the database is empty or was seeded with another size or generator version, so changing
 * `CATALOG_SIZE` takes effect on the next start; reseeding clears the carts, whose lines name variants of the old
 * catalog. Pending migrations run on every open. A local file holds generated data and carts, so one whose
 * migrations fail, such as a file written by an older schema, is regenerated rather than repaired. A remote
 * database is migrated and seeded in place.
 */
export async function openCatalogDatabase(options: OpenCatalogDatabaseOptions): Promise<CatalogDatabase> {
	if (!options.url.startsWith('file:')) {
		const remote = connect(options.url, options.authToken);
		await migrate(remote.db, { migrationsFolder: options.migrationsFolder });
		if (!(await isSeededWith(remote.db, options.sizeName))) await seed(remote.db, options);
		return { db: remote.db, close: () => remote.client.close() };
	}

	const filePath = path.fromFileUrl(options.url);
	if (fileSystem.exists(filePath)) {
		const existing = connect(options.url);
		if (await isCurrent(existing.db, options)) return { db: existing.db, close: () => existing.client.close() };
		existing.client.close();
	}
	await writeCatalogFile(filePath, options);
	const fresh = connect(options.url);
	return { db: fresh.db, close: () => fresh.client.close() };
}

/**
 * Reads `DATABASE_URL`, resolving a relative `file:` path against the app root.
 *
 * @remarks
 * The app root is the working directory, as for `eco.config.ts`: the production server runs from a bundle in
 * `dist/server/`, where a path relative to this module would point inside the build output.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const url = env.DATABASE_URL || 'file:.data/catalog.db';
	if (!url.startsWith('file:') || url.startsWith('file:///')) return url;
	return path.toFileUrl(path.resolve(path.cwd(), url.slice('file:'.length))).href;
}

const REGISTRY_KEY = Symbol.for('commerce.drizzle-database');

type RegistryHolder = { [REGISTRY_KEY]?: Map<string, Promise<CatalogDatabase>> };

/**
 * Returns the app's catalog database, opened once per process.
 *
 * @remarks
 * The registry lives on `globalThis` because the server entry, Page modules and Endpoint modules can each load
 * their own copy of this module; sharing it keeps one client and one seeding run per database.
 */
export function getCatalogDb(env: NodeJS.ProcessEnv = process.env): Promise<CatalogDb> {
	const url = resolveDatabaseUrl(env);
	const registry = ((globalThis as RegistryHolder)[REGISTRY_KEY] ??= new Map<string, Promise<CatalogDatabase>>());
	let pending = registry.get(url);
	if (!pending) {
		pending = openCatalogDatabase({
			url,
			authToken: env.DATABASE_AUTH_TOKEN || undefined,
			migrationsFolder: path.resolve(path.cwd(), MIGRATIONS_FOLDER),
			sizeName: resolveCatalogSize(env.CATALOG_SIZE).name,
		});
		pending.catch(() => registry.delete(url));
		registry.set(url, pending);
	}
	return pending.then(({ db }) => db);
}
