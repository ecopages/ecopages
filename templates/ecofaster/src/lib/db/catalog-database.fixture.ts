import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import type { CatalogSizeName } from '../catalog/generator.ts';
import { openCatalogDatabase, type CatalogDatabase } from './catalog-database.server.ts';

export const migrationsFolder = path.resolve(path.fromNative(import.meta.dirname), '../../../drizzle');

/** A temporary folder for a test's database files; `remove` deletes it. */
export function createTempDir(): { dir: string; remove: () => void } {
	const dir = fileSystem.mkdtemp(path.join(fileSystem.tempDir(), 'ecofaster-'));
	return { dir, remove: () => fileSystem.remove(dir) };
}

/** A seeded catalog in a temporary folder, for tests; `dispose` closes it and deletes the folder. */
export async function openTestCatalog(
	sizeName: CatalogSizeName = 'small',
): Promise<CatalogDatabase & { dispose: () => void }> {
	const temp = createTempDir();
	const database = await openCatalogDatabase({
		filePath: path.join(temp.dir, 'catalog.db'),
		migrationsFolder,
		sizeName,
	});
	return {
		...database,
		dispose: () => {
			database.close();
			temp.remove();
		},
	};
}
