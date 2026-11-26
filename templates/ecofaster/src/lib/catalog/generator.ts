import type { CategoryRow, CollectionRow, ProductRow, SubcategoryRow } from '../db/schema.ts';
import { hashString } from '../hash.ts';
import { FINISHES, MATERIALS, MODEL_NAMES, TAXONOMY } from './taxonomy.ts';

/**
 * Version of the generator output.
 *
 * @remarks
 * Bump it when a change to the taxonomy or the generator changes the rows, so existing databases are regenerated.
 */
export const CATALOG_VERSION = 1;

export type CatalogSize = {
	collections: number;
	categoriesPerCollection: number;
	subcategoriesPerCategory: number;
	productsPerSubcategory: number;
	/**
	 * Product pages rendered at build in each subcategory.
	 *
	 * @remarks
	 * The rest render on their first request and are cached like the prebuilt ones, which keeps large catalogs
	 * quick to build.
	 */
	prebuiltProductsPerSubcategory: number;
};

export type CatalogSizeName = 'small' | 'medium' | 'large';

export const CATALOG_SIZES: Record<CatalogSizeName, CatalogSize> = {
	small: {
		collections: 3,
		categoriesPerCollection: 3,
		subcategoriesPerCategory: 3,
		productsPerSubcategory: 4,
		prebuiltProductsPerSubcategory: 4,
	},
	medium: {
		collections: 6,
		categoriesPerCollection: 4,
		subcategoriesPerCategory: 4,
		productsPerSubcategory: 24,
		prebuiltProductsPerSubcategory: 4,
	},
	large: {
		collections: 6,
		categoriesPerCollection: 4,
		subcategoriesPerCategory: 4,
		productsPerSubcategory: 250,
		prebuiltProductsPerSubcategory: 1,
	},
};

export type GeneratedCatalog = {
	collections: CollectionRow[];
	categories: CategoryRow[];
	subcategories: SubcategoryRow[];
	products: ProductRow[];
};

function isCatalogSizeName(name: string): name is CatalogSizeName {
	return Object.hasOwn(CATALOG_SIZES, name);
}

/**
 * Reads a size preset name, as set in `CATALOG_SIZE`.
 *
 * @remarks
 * An empty or missing value is the small preset, sized so a fresh checkout and CI build in seconds.
 */
export function resolveCatalogSize(value: string | undefined): { name: CatalogSizeName; size: CatalogSize } {
	const name = value?.trim().toLowerCase() || 'small';
	if (!isCatalogSizeName(name)) {
		throw new Error(`Unknown catalog size "${value}". Use one of: ${Object.keys(CATALOG_SIZES).join(', ')}.`);
	}
	return { name, size: CATALOG_SIZES[name] };
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
}

/** Mulberry32: a small seeded generator, so the same size always yields the same catalog. */
function createRandom(seed: string): () => number {
	let state = hashString(seed);
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(items: readonly T[], random: () => number): T {
	return items[Math.floor(random() * items.length)]!;
}

function capitalize(value: string): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Every model and material pairing, shuffled, so a subcategory never repeats a name. */
function shuffledNamePairs(random: () => number): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	for (const model of MODEL_NAMES) {
		for (const material of MATERIALS) pairs.push([model, material]);
	}
	for (let index = pairs.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(random() * (index + 1));
		[pairs[index], pairs[swap]] = [pairs[swap]!, pairs[index]!];
	}
	return pairs;
}

function describeProduct(item: string, material: string, random: () => number): string {
	const finish = pick(FINISHES, random);
	const openers = [
		`A ${finish} ${item} in ${material}, made to be used every day.`,
		`This ${item} pairs ${material} with a ${finish} finish.`,
		`Built from ${material} and finished in ${finish}, this ${item} keeps its shape for years.`,
	];
	const closers = [
		'Ships flat with everything needed to assemble it.',
		'Wipe clean with a damp cloth.',
		'Covered by a five-year warranty.',
		'Each piece varies slightly in grain and tone.',
	];
	return `${pick(openers, random)} ${pick(closers, random)}`;
}

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
 * Ids are assigned in order, so a row's id is stable for a given size. Each subcategory draws its product names
 * from its own seeded generator, which keeps a product's name and slug the same when only `productsPerSubcategory`
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

			categorySeed.subcategories
				.slice(0, size.subcategoriesPerCategory)
				.forEach((subcategorySeed, subcategoryIndex) => {
					const subcategory: SubcategoryRow = {
						id: catalog.subcategories.length + 1,
						slug: slugify(subcategorySeed.name),
						name: subcategorySeed.name,
						position: subcategoryIndex,
						categoryId: category.id,
					};
					catalog.subcategories.push(subcategory);

					const random = createRandom(subcategory.slug);
					const pairs = shuffledNamePairs(random);
					for (let position = 0; position < size.productsPerSubcategory; position += 1) {
						const [model, material] = pairs[position]!;
						const name = capitalize(`${model} ${material} ${subcategorySeed.item}`);
						const priceFactor = 0.7 + random() * 0.9;
						catalog.products.push({
							id: catalog.products.length + 1,
							slug: slugify(name),
							name,
							description: describeProduct(subcategorySeed.item, material, random),
							priceCents:
								Math.max(1, Math.round((subcategorySeed.basePrice * priceFactor) / 100)) * 100 - 1,
							position,
							subcategoryId: subcategory.id,
						});
					}
				});
		});
	});

	return catalog;
}
