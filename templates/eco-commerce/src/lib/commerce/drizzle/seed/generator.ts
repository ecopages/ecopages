import type { CategoryRow, CollectionRow, ProductRow, SubcategoryRow } from '../schema.ts';
import type { CatalogSize } from './catalog-size.ts';
import { slugify } from '../slug.ts';
import { generateProduct, shuffledNamePairs } from './product-generator.ts';
import { createRandom } from './random.ts';
import { MATERIALS, MODEL_NAMES, TAXONOMY } from './taxonomy.ts';

export { CATALOG_SIZES, resolveCatalogSize, type CatalogSize, type CatalogSizeName } from './catalog-size.ts';

/**
 * Version of the generator output.
 *
 * @remarks
 * Bump it when a change to the taxonomy or the generator changes the rows, so existing databases are regenerated.
 */
export const CATALOG_VERSION = 3;

export type GeneratedCatalog = {
	collections: CollectionRow[];
	categories: CategoryRow[];
	subcategories: SubcategoryRow[];
	products: ProductRow[];
};

function assertWithinTaxonomy(size: CatalogSize): void {
	const limits: Array<[string, number, number]> = [
		['collections', size.collections, TAXONOMY.length],
		[
			'categoriesPerCollection',
			size.categoriesPerCollection,
			Math.min(...TAXONOMY.map((c) => c.categories.length)),
		],
		[
			'subcategoriesPerCategory',
			size.subcategoriesPerCategory,
			Math.min(...TAXONOMY.flatMap((c) => c.categories.map((category) => category.subcategories.length))),
		],
		['productsPerSubcategory', size.productsPerSubcategory, MODEL_NAMES.length * MATERIALS.length],
	];
	for (const [field, value, max] of limits) {
		if (value < 1 || value > max) {
			throw new Error(`Catalog size field "${field}" is ${value}; it must be between 1 and ${max}.`);
		}
	}
}

/**
 * Builds the catalog rows for a size, deterministically.
 *
 * @remarks
 * Ids are assigned in order, so a row's id is stable for a given size. Each subcategory draws its products from
 * its own seeded generator, which keeps a product's name and slug the same when only `productsPerSubcategory`
 * grows.
 */
export function generateCatalog(size: CatalogSize): GeneratedCatalog {
	assertWithinTaxonomy(size);
	const catalog: GeneratedCatalog = { collections: [], categories: [], subcategories: [], products: [] };

	TAXONOMY.slice(0, size.collections).forEach((collectionSeed, collectionIndex) => {
		const collection: CollectionRow = {
			id: catalog.collections.length + 1,
			slug: slugify(collectionSeed.name),
			name: collectionSeed.name,
			tagline: collectionSeed.tagline,
			position: collectionIndex,
		};
		catalog.collections.push(collection);

		collectionSeed.categories.slice(0, size.categoriesPerCollection).forEach((categorySeed, categoryIndex) => {
			const category: CategoryRow = {
				id: catalog.categories.length + 1,
				slug: slugify(categorySeed.name),
				name: categorySeed.name,
				position: categoryIndex,
				collectionId: collection.id,
			};
			catalog.categories.push(category);

			categorySeed.subcategories.slice(0, size.subcategoriesPerCategory).forEach((seed, subcategoryIndex) => {
				const subcategory: SubcategoryRow = {
					id: catalog.subcategories.length + 1,
					slug: slugify(seed.name),
					name: seed.name,
					position: subcategoryIndex,
					categoryId: category.id,
				};
				catalog.subcategories.push(subcategory);

				const random = createRandom(subcategory.slug);
				const pairs = shuffledNamePairs(random);
				for (let position = 0; position < size.productsPerSubcategory; position += 1) {
					const row = { id: catalog.products.length + 1, position, subcategoryId: subcategory.id };
					catalog.products.push(generateProduct(seed, pairs[position]!, row, random));
				}
			});
		});
	});

	return catalog;
}
