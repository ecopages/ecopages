import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CommerceBackend } from './backend.ts';
import type { ProductCard } from './types.ts';

export type ContractSubject = {
	backend: CommerceBackend;
	dispose: () => void | Promise<void>;
};

function prices(items: ProductCard[]): number[] {
	return items.map((item) => item.price.amount);
}

/**
 * The behaviour every `CommerceBackend` adapter must have, as a Vitest suite.
 *
 * @remarks
 * It asserts relations between answers, never fixed data, so an adapter over another catalog runs it unchanged:
 * call it from that adapter's test file with a function that opens the adapter. The catalog needs at least one
 * collection whose first subcategory holds two products or more, with prices that differ.
 */
export function describeCommerceBackendContract(name: string, open: () => Promise<ContractSubject>): void {
	describe(`CommerceBackend contract: ${name}`, () => {
		let subject: ContractSubject;
		let backend: CommerceBackend;

		beforeAll(async () => {
			subject = await open();
			backend = subject.backend;
		});

		afterAll(() => subject.dispose());

		async function firstSubcategory() {
			const [collection] = await backend.catalog.getStoreTree();
			const category = collection!.categories[0]!;
			return { collection: collection!, category, subcategory: category.subcategories[0]! };
		}

		test('the store tree reaches each collection, category and subcategory by handle', async () => {
			const { collection, category, subcategory } = await firstSubcategory();

			expect((await backend.catalog.getCollection(collection.handle))?.id).toBe(collection.id);
			expect((await backend.catalog.getCategory(collection.handle, category.handle))?.category.id).toBe(
				category.id,
			);
			const detail = await backend.catalog.getSubcategory(collection.handle, category.handle, subcategory.handle);
			expect(detail?.subcategory.productCount).toBe(subcategory.productCount);
		});

		test('handles that do not exist resolve null', async () => {
			const { collection, category } = await firstSubcategory();

			expect(await backend.catalog.getCollection('no-such-collection')).toBeNull();
			expect(await backend.catalog.getCategory(collection.handle, 'no-such-category')).toBeNull();
			expect(await backend.catalog.getSubcategory(collection.handle, category.handle, 'no-such')).toBeNull();
			expect(await backend.catalog.getProduct('no-such-product')).toBeNull();
		});

		test('a listing pages through every product of its scope once', async () => {
			const { subcategory } = await firstSubcategory();
			const first = await backend.catalog.listProducts({ subcategory: subcategory.handle, pageSize: 1 });
			const handles = new Set<string>();
			for (let page = 1; page <= first.pageCount; page += 1) {
				const result = await backend.catalog.listProducts({
					subcategory: subcategory.handle,
					pageSize: 1,
					page,
				});
				for (const item of result.items) handles.add(item.handle);
			}

			expect(first.total).toBe(subcategory.productCount);
			expect(first.pageCount).toBe(subcategory.productCount);
			expect(handles.size).toBe(subcategory.productCount);
		});

		test('sorting by price orders the listing by price', async () => {
			const { subcategory } = await firstSubcategory();
			const ascending = await backend.catalog.listProducts({
				subcategory: subcategory.handle,
				sort: 'price-asc',
			});
			const descending = await backend.catalog.listProducts({
				subcategory: subcategory.handle,
				sort: 'price-desc',
			});

			expect(prices(ascending.items)).toEqual([...prices(ascending.items)].sort((a, b) => a - b));
			expect(prices(descending.items)).toEqual([...prices(ascending.items)].reverse());
		});

		test('filters narrow a listing to the products that match each of them', async () => {
			const { subcategory } = await firstSubcategory();
			const all = await backend.catalog.listProducts({ subcategory: subcategory.handle });
			const material = all.facets.materials[0]!;
			const ceiling = Math.max(...prices(all.items)) - 1;
			const filtered = await backend.catalog.listProducts({
				subcategory: subcategory.handle,
				materials: [material],
				maxPrice: ceiling,
			});

			expect(filtered.total).toBeLessThan(all.total);
			expect(filtered.items.every((item) => item.material === material && item.price.amount <= ceiling)).toBe(
				true,
			);
			expect(filtered.facets).toEqual(all.facets);
		});

		test('a search matches product titles, ignoring case', async () => {
			const { subcategory } = await firstSubcategory();
			const sample = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items[0]!;
			const word = sample.title.split(' ').at(-1)!.toUpperCase();

			const result = await backend.catalog.listProducts({ search: word });

			expect(result.items.map((item) => item.handle)).toContain(sample.handle);
			expect(result.items.every((item) => item.title.toUpperCase().includes(word))).toBe(true);
		});

		test('a product has variants, its place in the tree, and related products that exclude it', async () => {
			const { collection, subcategory } = await firstSubcategory();
			const card = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items[0]!;

			const product = await backend.catalog.getProduct(card.handle);
			const related = await backend.catalog.getRelatedProducts(card.handle, 4);

			expect(product?.variants.length).toBeGreaterThan(0);
			expect(product?.collection.handle).toBe(collection.handle);
			expect(product?.subcategory.handle).toBe(subcategory.handle);
			expect(related.length).toBeGreaterThan(0);
			expect(related.some((item) => item.handle === card.handle)).toBe(false);
		});

		test('a cart takes items by variant, changes quantities and removes lines', async () => {
			const { subcategory } = await firstSubcategory();
			const card = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items[0]!;
			const variant = (await backend.catalog.getProduct(card.handle))!.variants[0]!;

			const added = await backend.cart.addItem(null, { variantId: variant.id, quantity: 2 });
			expect(added.ok && added.cart.lines).toEqual([
				expect.objectContaining({ variantId: variant.id, productId: card.id, quantity: 2 }),
			]);
			if (!added.ok) return;
			expect((await backend.cart.getCart(added.token)).itemCount).toBe(2);

			const updated = await backend.cart.updateItem(added.token, { variantId: variant.id, quantity: 5 });
			expect(updated.ok && updated.cart.itemCount).toBe(5);
			if (!updated.ok) return;

			const removed = await backend.cart.updateItem(updated.token, { variantId: variant.id, quantity: 0 });
			expect(removed.ok && removed.cart.lines).toEqual([]);
		});

		test('two tabs that add different products at the same moment both keep their product', async () => {
			const { subcategory } = await firstSubcategory();
			const [first, second] = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items;
			const chair = (await backend.catalog.getProduct(first!.handle))!.variants[0]!.id;
			const lamp = (await backend.catalog.getProduct(second!.handle))!.variants[0]!.id;
			const shared = await backend.cart.addItem(null, { variantId: chair, quantity: 1 });
			if (!shared.ok) throw new Error(shared.message);

			await Promise.all([
				backend.cart.addItem(shared.token, { variantId: chair, quantity: 1 }),
				backend.cart.addItem(shared.token, { variantId: lamp, quantity: 1 }),
			]);

			const cart = await backend.cart.getCart(shared.token);
			expect(cart.lines.map((line) => [line.variantId, line.quantity])).toEqual([
				[chair, 2],
				[lamp, 1],
			]);
		});

		test('a token whose signature does not match reads as an empty cart', async () => {
			const { subcategory } = await firstSubcategory();
			const card = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items[0]!;
			const variant = (await backend.catalog.getProduct(card.handle))!.variants[0]!;
			const added = await backend.cart.addItem(null, { variantId: variant.id, quantity: 1 });
			if (!added.ok) throw new Error(added.message);

			expect((await backend.cart.getCart(`${added.token}x`)).lines).toEqual([]);
		});

		test('removing a line from a cart that does not exist changes nothing and asks for no cookie', async () => {
			const { subcategory } = await firstSubcategory();
			const card = (await backend.catalog.listProducts({ subcategory: subcategory.handle })).items[0]!;
			const variant = (await backend.catalog.getProduct(card.handle))!.variants[0]!;

			expect(await backend.cart.updateItem(null, { variantId: variant.id, quantity: 0 })).toMatchObject({
				ok: true,
				token: null,
				cart: { lines: [], itemCount: 0 },
			});
		});

		test('a cart refuses a variant the catalog does not have, and an empty token is an empty cart', async () => {
			const refused = await backend.cart.addItem(null, { variantId: 'no-such-variant', quantity: 1 });

			expect(refused).toMatchObject({ ok: false, reason: 'unknown-variant' });
			expect(await backend.cart.getCart(null)).toMatchObject({ lines: [], itemCount: 0 });
		});
	});
}
