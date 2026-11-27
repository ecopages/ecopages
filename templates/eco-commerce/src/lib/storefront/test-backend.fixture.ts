import type { CommerceBackend } from '../commerce/backend.ts';
import { createDrizzleBackend } from '../commerce/drizzle/adapter.server.ts';
import { openTestCatalog } from '../commerce/drizzle/database.fixture.ts';

/** The Drizzle adapter over a seeded small catalog in a temporary folder, for the storefront tests. */
export async function openTestBackend(): Promise<{ backend: CommerceBackend; dispose: () => void }> {
	const database = await openTestCatalog();
	const backend = createDrizzleBackend({
		getDb: async () => database.db,
		getCartSecret: () => 'storefront-test-secret-of-at-least-32',
	});
	return { backend, dispose: database.dispose };
}

/** The first variant of the first product in the first subcategory. */
export async function firstVariant(backend: CommerceBackend): Promise<{ handle: string; variantId: string }> {
	const [collection] = await backend.catalog.getStoreTree();
	const subcategory = collection!.categories[0]!.subcategories[0]!;
	const card = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items[0]!;
	const product = await backend.catalog.getProduct(card.handle);
	return { handle: card.handle, variantId: product!.variants[0]!.id };
}
