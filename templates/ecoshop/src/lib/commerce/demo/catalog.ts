/**
 * The bundled demo catalog: what the storefront sells when no Shopify store is configured.
 *
 * @remarks
 * Prices are decimal strings in one currency, as the Storefront API returns them. Each variant's options follow the
 * product's `options` order. Images live in `src/public/demo/`.
 *
 * @module
 */

export interface DemoVariantSeed {
	options: string[];
	price: string;
	compareAtPrice?: string;
	available?: boolean;
}

export interface DemoProductSeed {
	handle: string;
	title: string;
	productType: string;
	tags: string[];
	description: string;
	options: { name: string; values: string[] }[];
	variants: DemoVariantSeed[];
}

export interface DemoCollectionSeed {
	handle: string;
	title: string;
	description: string;
	products: string[];
}

export const DEMO_STORE = {
	name: 'Ecoshop',
	description: 'Everyday goods made to last. This is the demo catalog of the Ecoshop template.',
	vendor: 'Ecoshop Supply',
	currencyCode: 'USD',
} as const;

const sizes = (values: string[], price: string, soldOut: string[] = []): DemoVariantSeed[] =>
	values.map((value) => ({ options: [value], price, available: !soldOut.includes(value) }));

export const DEMO_PRODUCTS: DemoProductSeed[] = [
	{
		handle: 'field-shirt',
		title: 'Field Shirt',
		productType: 'Shirts',
		tags: ['organic cotton', 'button-down'],
		description:
			'A button-down shirt in organic cotton twill. Reinforced elbows, two chest pockets and a relaxed cut for long days outside.',
		options: [{ name: 'Size', values: ['S', 'M', 'L'] }],
		variants: sizes(['S', 'M', 'L'], '68.00'),
	},
	{
		handle: 'linen-overshirt',
		title: 'Linen Overshirt',
		productType: 'Shirts',
		tags: ['linen', 'layering'],
		description:
			'A boxy overshirt in heavy European linen that softens with every wash. Wear it open over a tee or buttoned up on cool evenings.',
		options: [{ name: 'Size', values: ['S', 'M', 'L'] }],
		variants: sizes(['S', 'M', 'L'], '92.00', ['L']),
	},
	{
		handle: 'trail-tee',
		title: 'Trail T-Shirt',
		productType: 'T-Shirts',
		tags: ['organic cotton', 'everyday'],
		description:
			'A midweight crew-neck tee knitted from organic cotton. Pre-shrunk, with taped shoulder seams so it keeps its shape.',
		options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }],
		variants: [
			...sizes(['S', 'M', 'L'], '32.00'),
			{ options: ['XL'], price: '32.00', compareAtPrice: '38.00', available: true },
		],
	},
	{
		handle: 'merino-beanie',
		title: 'Merino Beanie',
		productType: 'Hats',
		tags: ['merino', 'winter'],
		description: 'A ribbed beanie in fine merino wool. Warm without itching, and it folds flat into a pocket.',
		options: [{ name: 'Color', values: ['Moss', 'Charcoal'] }],
		variants: sizes(['Moss', 'Charcoal'], '28.00'),
	},
	{
		handle: 'canvas-tote',
		title: 'Canvas Tote',
		productType: 'Bags',
		tags: ['recycled', 'carry'],
		description:
			'A roomy tote in recycled cotton canvas with an inner pocket and long handles that sit comfortably on the shoulder.',
		options: [{ name: 'Title', values: ['Default Title'] }],
		variants: [{ options: ['Default Title'], price: '36.00' }],
	},
	{
		handle: 'seed-notebook',
		title: 'Seed Paper Notebook',
		productType: 'Stationery',
		tags: ['paper', 'plantable'],
		description:
			'An A5 notebook with 96 recycled pages. The cover is made of seed paper: soak it, plant it, and it grows wildflowers.',
		options: [{ name: 'Title', values: ['Default Title'] }],
		variants: [{ options: ['Default Title'], price: '14.00' }],
	},
	{
		handle: 'steel-bottle',
		title: 'Steel Bottle',
		productType: 'Drinkware',
		tags: ['stainless steel', 'insulated'],
		description:
			'A double-walled stainless steel bottle that keeps drinks cold for a day and hot for half of one. No plastic in contact with the drink.',
		options: [{ name: 'Capacity', values: ['500 ml', '750 ml'] }],
		variants: [
			{ options: ['500 ml'], price: '24.00' },
			{ options: ['750 ml'], price: '29.00' },
		],
	},
	{
		handle: 'beeswax-wraps',
		title: 'Beeswax Wraps',
		productType: 'Kitchen',
		tags: ['beeswax', 'plastic-free'],
		description:
			'A set of three food wraps in cotton coated with beeswax and tree resin. Warm one in your hands and it seals around bowls and bread.',
		options: [{ name: 'Title', values: ['Default Title'] }],
		variants: [{ options: ['Default Title'], price: '18.00' }],
	},
];

export const DEMO_COLLECTIONS: DemoCollectionSeed[] = [
	{
		handle: 'apparel',
		title: 'Apparel',
		description: 'Shirts and tees in natural fibres, cut to be worn for years.',
		products: ['field-shirt', 'linen-overshirt', 'trail-tee'],
	},
	{
		handle: 'accessories',
		title: 'Accessories',
		description: 'Small things that earn their place in a bag.',
		products: ['merino-beanie', 'canvas-tote', 'seed-notebook'],
	},
	{
		handle: 'home',
		title: 'Home',
		description: 'Kitchen and table goods that replace something disposable.',
		products: ['steel-bottle', 'beeswax-wraps'],
	},
];
