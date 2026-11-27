import type { ProductRow } from '../schema.ts';
import { pick, shuffle, type Random } from './random.ts';
import { FINISHES, MATERIALS, MODEL_NAMES, type SubcategorySeed } from './taxonomy.ts';
import { slugify } from '../slug.ts';

/** Share of products marked new, and of products on sale. */
const NEW_SHARE = 0.12;
const SALE_SHARE = 0.15;

/** Finishes a product offers: at least two, so the product page always has a choice. */
const FINISHES_PER_PRODUCT = 3;

function capitalize(value: string): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Every model and material pairing, shuffled, so a subcategory never repeats a name. */
export function shuffledNamePairs(random: Random): Array<[string, string]> {
	return shuffle(
		MODEL_NAMES.flatMap((model) => MATERIALS.map((material): [string, string] => [model, material])),
		random,
	);
}

function describeProduct(item: string, material: string, finish: string, random: Random): string {
	const openers = [
		`A ${item} in ${material}, made to be used every day.`,
		`This ${item} pairs ${material} with a choice of finishes, ${finish} among them.`,
		`Built from ${material}, this ${item} keeps its shape for years.`,
	];
	const closers = [
		'Ships flat with everything needed to assemble it.',
		'Wipe clean with a damp cloth.',
		'Covered by a five-year warranty.',
		'Each piece varies slightly in grain and tone.',
	];
	return `${pick(openers, random)} ${pick(closers, random)}`;
}

/** Rounds to whole dollars and ends in 99 cents. */
function retailPrice(cents: number): number {
	return Math.max(1, Math.round(cents / 100)) * 100 - 1;
}

/** One product row: name, price, material, finishes and badge, all drawn from `random`. */
export function generateProduct(
	seed: SubcategorySeed,
	[model, material]: [string, string],
	row: { id: number; position: number; subcategoryId: number },
	random: Random,
): ProductRow {
	const name = capitalize(`${model} ${material} ${seed.item}`);
	const priceCents = retailPrice(seed.basePrice * (0.7 + random() * 0.9));
	const finishes = shuffle(FINISHES, random).slice(0, FINISHES_PER_PRODUCT);
	const roll = random();
	const onSale = roll < SALE_SHARE;
	return {
		...row,
		slug: slugify(name),
		name,
		description: describeProduct(seed.item, material, finishes[0]!, random),
		priceCents: onSale ? retailPrice(priceCents * 0.8) : priceCents,
		compareAtCents: onSale ? priceCents : null,
		material,
		finishes: finishes.join(','),
		badge: onSale ? 'sale' : roll < SALE_SHARE + NEW_SHARE ? 'new' : null,
	};
}
