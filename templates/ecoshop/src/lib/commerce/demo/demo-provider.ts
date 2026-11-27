import { describeLine, describeShortage } from '@/lib/cart/cart-messages';
import { storePaths } from '@/lib/store-urls';
import { CartInputError } from '../errors';
import { fromCents, toCents } from '../money';
import {
	type Cart,
	type CartMessage,
	type CartLine,
	type CartLineQuantity,
	type Collection,
	type CommerceProvider,
	type ProductListOptions,
	type Product,
	type ProductSort,
	type ProductSummary,
	type ProductVariant,
	DEFAULT_VARIANT_TITLE,
	MAX_LINE_QUANTITY,
} from '../types';
import { DEMO_COLLECTIONS, DEMO_POLICIES, DEMO_PRODUCTS, DEMO_STORE, type DemoProductSeed } from './catalog';

const CART_PREFIX = 'demo-cart.';

type CartContents = Map<string, number>;

function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '');
}

function toProduct(seed: DemoProductSeed): Product {
	const variants: ProductVariant[] = seed.variants.map((variant) => {
		const isDefault = variant.options[0] === DEFAULT_VARIANT_TITLE;
		const key = isDefault ? seed.handle : `${seed.handle}-${slug(variant.options.join(' '))}`;
		return {
			id: `gid://ecoshop/ProductVariant/${key}`,
			title: variant.options.join(' / '),
			availableForSale: variant.available ?? true,
			price: { amount: variant.price, currencyCode: DEMO_STORE.currencyCode },
			compareAtPrice: variant.compareAtPrice
				? { amount: variant.compareAtPrice, currencyCode: DEMO_STORE.currencyCode }
				: null,
			selectedOptions: seed.options.map((option, index) => ({
				name: option.name,
				value: variant.options[index] ?? '',
			})),
		};
	});
	const cents = variants.map((variant) => toCents(variant.price.amount));
	const image = {
		url: `/demo/${seed.handle}.svg`,
		altText: seed.title,
		width: 800,
		height: 800,
	};

	return {
		id: `gid://ecoshop/Product/${seed.handle}`,
		handle: seed.handle,
		title: seed.title,
		vendor: DEMO_STORE.vendor,
		description: seed.description,
		productType: seed.productType,
		tags: seed.tags,
		options: seed.options,
		variants,
		availableForSale: variants.some((variant) => variant.availableForSale),
		priceRange: {
			min: fromCents(Math.min(...cents), DEMO_STORE.currencyCode),
			max: fromCents(Math.max(...cents), DEMO_STORE.currencyCode),
		},
		featuredImage: image,
		images: [
			image,
			...(seed.extraImages ?? []).map((extra) => ({
				url: `/demo/${extra.file}`,
				altText: extra.alt,
				width: 800,
				height: 800,
			})),
		],
		defaultVariantId: variants.find((variant) => variant.availableForSale)?.id ?? null,
		variantCount: variants.length,
	};
}

function toSummary(product: Product): ProductSummary {
	const { id, handle, title, vendor, availableForSale, priceRange, featuredImage, productType, options } = product;
	const { defaultVariantId, variantCount } = product;
	return {
		id,
		handle,
		title,
		vendor,
		availableForSale,
		priceRange,
		featuredImage,
		productType,
		options,
		defaultVariantId,
		variantCount,
	};
}

function take<T>(items: T[], options?: ProductListOptions): T[] {
	const offset = options?.offset ?? 0;
	return options?.limit === undefined ? items.slice(offset) : items.slice(offset, offset + options.limit);
}

/**
 * Orders products as the Shopify provider asks Shopify to: the catalog order is the best-selling one, and a tie in
 * price or title keeps that order.
 */
function sortProducts(products: ProductSummary[], sort: ProductSort = 'best-selling'): ProductSummary[] {
	const price = (product: ProductSummary) => Number(product.priceRange.min.amount);
	const orders: Record<ProductSort, (a: ProductSummary, b: ProductSummary) => number> = {
		'best-selling': () => 0,
		'price-ascending': (a, b) => price(a) - price(b),
		'price-descending': (a, b) => price(b) - price(a),
		'title-ascending': (a, b) => a.title.localeCompare(b.title),
		'title-descending': (a, b) => b.title.localeCompare(a.title),
	};
	return [...products].sort(orders[sort]);
}

/**
 * A commerce provider over the bundled catalog, used when no Shopify store is configured.
 *
 * @remarks
 * The cart has no server state: its id is the cart's contents, encoded. Every mutation returns a new id, which the
 * cart cookie or an MCP client keeps, so the demo cart works across processes, restarts and serverless instances
 * without a database. An id that does not decode to known variants is treated as no cart.
 */
export function createDemoProvider(): CommerceProvider {
	const products = DEMO_PRODUCTS.map(toProduct);
	const productsByHandle = new Map(products.map((product) => [product.handle, product]));
	const stock = new Map(
		DEMO_PRODUCTS.flatMap((seed, productIndex) =>
			seed.variants.flatMap((seedVariant, position) => {
				const variant = products[productIndex]?.variants[position];
				return variant && seedVariant.stock !== undefined ? [[variant.id, seedVariant.stock] as const] : [];
			}),
		),
	);
	const variantIndex = new Map(
		products.flatMap((product) => product.variants.map((variant) => [variant.id, { product, variant }] as const)),
	);
	const collections: Collection[] = DEMO_COLLECTIONS.map(({ handle, title, description }) => ({
		id: `gid://ecoshop/Collection/${handle}`,
		handle,
		title,
		description,
	}));

	function encodeCart(contents: CartContents): string {
		return `${CART_PREFIX}${Buffer.from(JSON.stringify([...contents])).toString('base64url')}`;
	}

	function decodeCart(cartId: string): CartContents | null {
		if (!cartId.startsWith(CART_PREFIX)) return null;
		try {
			const entries: unknown = JSON.parse(Buffer.from(cartId.slice(CART_PREFIX.length), 'base64url').toString());
			if (!Array.isArray(entries)) return null;
			const contents: CartContents = new Map();
			for (const entry of entries) {
				if (!Array.isArray(entry) || entry.length !== 2) return null;
				const [variantId, quantity] = entry as [unknown, unknown];
				if (typeof variantId !== 'string' || !variantIndex.has(variantId)) return null;
				if (
					!Number.isInteger(quantity) ||
					(quantity as number) < 1 ||
					(quantity as number) > MAX_LINE_QUANTITY
				) {
					return null;
				}
				contents.set(variantId, quantity as number);
			}
			return contents;
		} catch {
			return null;
		}
	}

	function toCart(contents: CartContents): Cart {
		let subtotalCents = 0;
		let totalQuantity = 0;
		const lines: CartLine[] = [];
		for (const [variantId, quantity] of contents) {
			const entry = variantIndex.get(variantId);
			if (!entry) continue;
			const { product, variant } = entry;
			const lineCents = toCents(variant.price.amount) * quantity;
			subtotalCents += lineCents;
			totalQuantity += quantity;
			lines.push({
				id: `demo-line:${variantId}`,
				quantity,
				variantId,
				variantTitle: variant.title,
				productHandle: product.handle,
				productTitle: product.title,
				unitPrice: variant.price,
				totalPrice: fromCents(lineCents, DEMO_STORE.currencyCode),
				image: product.featuredImage,
			});
		}
		return {
			id: encodeCart(contents),
			checkoutUrl: storePaths.demoCheckout,
			totalQuantity,
			subtotal: fromCents(subtotalCents, DEMO_STORE.currencyCode),
			lines,
		};
	}

	/**
	 * Takes a quantity down to the stock of its variant, as Shopify does, and says so in `messages`.
	 *
	 * @param previous What the cart held of the variant before an addition. An addition that adds nothing because the
	 * cart already holds the stock is refused, as the Shopify provider refuses it.
	 */
	function capToStock(
		{ product, variant }: { product: Product; variant: ProductVariant },
		wanted: number,
		previous: number | undefined,
		messages: CartMessage[],
	): number {
		const held = Math.min(wanted, stock.get(variant.id) ?? wanted);
		if (held === wanted) return held;
		const content = describeShortage(
			describeLine({ productTitle: product.title, variantTitle: variant.title }),
			held,
			wanted,
		);
		if (previous !== undefined && held <= previous) throw new CartInputError(content);
		messages.push({ type: 'warning', code: 'quantity_reduced', content, variantId: variant.id, wanted });
		return held;
	}

	function knownVariant(variantId: string) {
		const entry = variantIndex.get(variantId);
		if (!entry) throw new CartInputError(`Unknown variant: ${variantId}`);
		return entry;
	}

	function applyLines(cartId: string | undefined, lines: CartLineQuantity[], mode: 'add' | 'set'): Cart {
		const contents = (cartId && decodeCart(cartId)) || new Map<string, number>();
		const listed = new Set<string>();
		const messages: CartMessage[] = [];
		for (const { variantId, quantity } of lines) {
			const entry = knownVariant(variantId);
			if (mode === 'set' && listed.has(variantId)) {
				throw new CartInputError(`${entry.product.title} (${entry.variant.title}) is listed twice.`);
			}
			listed.add(variantId);
			const next = mode === 'add' ? (contents.get(variantId) ?? 0) + quantity : quantity;
			if (next > MAX_LINE_QUANTITY) {
				throw new CartInputError(`A cart line holds at most ${MAX_LINE_QUANTITY} of ${entry.product.title}.`);
			}
			if (next > 0 && !entry.variant.availableForSale) {
				throw new CartInputError(`${entry.product.title} (${entry.variant.title}) is sold out.`);
			}
			const held = capToStock(entry, next, mode === 'add' ? (contents.get(variantId) ?? 0) : undefined, messages);
			if (held > 0) contents.set(variantId, held);
			else contents.delete(variantId);
		}
		const cart = toCart(contents);
		return messages.length ? { ...cart, messages } : cart;
	}

	return {
		getStore: async () => ({ name: DEMO_STORE.name, description: DEMO_STORE.description }),
		ucpOrigin: () => null,
		listProducts: async (options) => take(sortProducts(products.map(toSummary), options?.sort), options),
		searchProducts: async (query, options) => {
			const terms = query.toLowerCase().split(/\s+/u).filter(Boolean);
			const matches = products.filter((product) => {
				const haystack = [product.title, product.productType, ...product.tags].join(' ').toLowerCase();
				return terms.every((term) => haystack.includes(term));
			});
			return take(matches.map(toSummary), options);
		},
		getProduct: async (handleOrId) =>
			productsByHandle.get(handleOrId.replace(/^gid:\/\/ecoshop\/Product\//u, '')) ?? null,
		listPolicies: async () => DEMO_POLICIES,
		listCollections: async (options) => take(collections, options),
		getCollection: async (handle, options) => {
			const collection = collections.find((entry) => entry.handle === handle);
			const seed = DEMO_COLLECTIONS.find((entry) => entry.handle === handle);
			if (!collection || !seed) return null;
			const members = seed.products.flatMap((productHandle) => {
				const product = productsByHandle.get(productHandle);
				return product ? [toSummary(product)] : [];
			});
			return { collection, products: take(sortProducts(members, options?.sort), options) };
		},
		getCart: async (cartId) => {
			const contents = decodeCart(cartId);
			return contents ? toCart(contents) : null;
		},
		addToCart: async (cartId, lines) => applyLines(cartId, lines, 'add'),
		setCartQuantities: async (cartId, lines) => applyLines(cartId, lines, 'set'),
	};
}
