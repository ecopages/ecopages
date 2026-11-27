/**
 * The bundled demo catalog: what the storefront sells when no Shopify store is configured.
 *
 * @remarks
 * Prices are decimal strings in one currency, as the Storefront API returns them. Each variant's options follow the
 * product's `options` order. Images live in `src/public/demo/`.
 *
 * @module
 */

import { POLICY_HANDLES } from '../../store-urls';
import type { StorePolicy } from '../types';

export interface DemoVariantSeed {
	options: string[];
	price: string;
	compareAtPrice?: string;
	available?: boolean;
	/** How many the demo store holds. A cart takes no more, as Shopify caps a line at its stock. Default: no limit. */
	stock?: number;
}

export interface DemoProductSeed {
	handle: string;
	title: string;
	productType: string;
	tags: string[];
	description: string;
	options: { name: string; values: string[] }[];
	variants: DemoVariantSeed[];
	/** Extra views after `<handle>.svg`, as `src/public/demo/` file names. */
	extraImages?: { file: string; alt: string }[];
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
		extraImages: [{ file: 'field-shirt-back.svg', alt: 'Field Shirt, back view' }],
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
		variants: [{ options: ['Default Title'], price: '36.00', stock: 3 }],
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

/**
 * The demo store's policies and FAQ, which `/policies/<handle>` renders and the `ask_business` tool answers from.
 */
export const DEMO_POLICIES: StorePolicy[] = [
	{
		handle: POLICY_HANDLES.refund,
		type: 'refund_policy',
		title: 'Returns and refunds',
		body: [
			'Return any unworn, unwashed item within 30 days of delivery for a full refund to the original payment method.',
			'Start a return from your order confirmation email. Returns within the country are free; we email a prepaid label.',
			'Gifts can be returned by the recipient for store credit, without the price being shown to them.',
			'Final-sale items are marked on their product page and cannot be returned.',
		].join('\n\n'),
	},
	{
		handle: POLICY_HANDLES.shipping,
		type: 'shipping_policy',
		title: 'Shipping',
		body: [
			'Orders ship within two business days from our warehouse.',
			'Standard delivery takes 3 to 5 business days within the country and is free over $75. Express delivery takes 1 to 2 business days.',
			'We ship to Canada and the European Union in 6 to 10 business days. Import duties are included in the price at checkout.',
		].join('\n\n'),
	},
	{
		handle: POLICY_HANDLES.privacy,
		type: 'privacy_policy',
		title: 'Privacy',
		body: [
			'We collect only what we need to deliver your order: your name, address, email and the items you buy.',
			'Payments are handled by our checkout provider; we never see or store card numbers.',
			'Email privacy@ecoshop.example to see, correct or delete the data we hold about you.',
		].join('\n\n'),
	},
	{
		handle: POLICY_HANDLES.terms,
		type: 'terms_of_service',
		title: 'Terms of service',
		body: [
			'Prices are shown in US dollars and include taxes where required.',
			'An order is accepted when we send the shipping confirmation. We may cancel an order for an item that turns out to be out of stock, with a full refund.',
		].join('\n\n'),
	},
	{
		handle: 'faq',
		type: 'faq',
		title: 'Frequently asked questions',
		body: [
			'Do you offer gift wrapping? Yes. Choose gift wrapping at checkout; it is wrapped in recycled paper with a handwritten card.',
			'How do I contact you? Email hello@ecoshop.example or call +1 555 0100, Monday to Friday, 9:00 to 17:00 Eastern time.',
			'Where are your products made? Our apparel is sewn in Portugal and our home goods are made in small workshops in Europe.',
			'How should I wash organic cotton? Wash cold, inside out, and line dry to keep the shape and colour.',
		].join('\n\n'),
	},
];
