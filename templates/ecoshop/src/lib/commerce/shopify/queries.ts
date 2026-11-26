/**
 * Storefront API documents. Every field the storefront reads is named here, and `normalize.ts` maps the result
 * onto the commerce model.
 */
const MONEY = /* GraphQL */ `
	fragment MoneyFields on MoneyV2 {
		amount
		currencyCode
	}
`;

const IMAGE = /* GraphQL */ `
	fragment ImageFields on Image {
		url
		altText
		width
		height
	}
`;

const PRODUCT_SUMMARY = /* GraphQL */ `
	fragment ProductSummaryFields on Product {
		id
		handle
		title
		vendor
		availableForSale
		priceRange {
			minVariantPrice {
				...MoneyFields
			}
			maxVariantPrice {
				...MoneyFields
			}
		}
		featuredImage {
			...ImageFields
		}
		productType
		options {
			name
			optionValues {
				name
			}
		}
		selectedOrFirstAvailableVariant {
			id
			availableForSale
		}
		variantsCount {
			count
		}
	}
	${MONEY}
	${IMAGE}
`;

/**
 * The most nodes one connection page returns, the Storefront API's maximum. Longer variant and cart-line lists
 * are read page by page.
 */
export const PAGE_SIZE = 250;

const PAGE_INFO = /* GraphQL */ `
	fragment PageInfoFields on PageInfo {
		hasNextPage
		endCursor
	}
`;

const VARIANT = /* GraphQL */ `
	fragment VariantFields on ProductVariant {
		id
		title
		availableForSale
		price {
			...MoneyFields
		}
		compareAtPrice {
			...MoneyFields
		}
		selectedOptions {
			name
			value
		}
	}
`;

const PRODUCT = /* GraphQL */ `
	fragment ProductFields on Product {
		...ProductSummaryFields
		description
		tags
		variants(first: ${PAGE_SIZE}) {
			nodes {
				...VariantFields
			}
			pageInfo {
				...PageInfoFields
			}
		}
		images(first: 10) {
			nodes {
				...ImageFields
			}
		}
	}
	${PRODUCT_SUMMARY}
	${VARIANT}
	${PAGE_INFO}
`;

const CART_LINE = /* GraphQL */ `
	fragment CartLineFields on BaseCartLine {
		id
		quantity
		cost {
			amountPerQuantity {
				...MoneyFields
			}
			totalAmount {
				...MoneyFields
			}
		}
		merchandise {
			... on ProductVariant {
				id
				title
				image {
					...ImageFields
				}
				product {
					handle
					title
					featuredImage {
						...ImageFields
					}
				}
			}
		}
	}
`;

const CART = /* GraphQL */ `
	fragment CartFields on Cart {
		id
		checkoutUrl
		totalQuantity
		cost {
			subtotalAmount {
				...MoneyFields
			}
		}
		lines(first: ${PAGE_SIZE}) {
			nodes {
				...CartLineFields
			}
			pageInfo {
				...PageInfoFields
			}
		}
	}
	${CART_LINE}
	${PAGE_INFO}
	${MONEY}
	${IMAGE}
`;

/**
 * The payload selection of a cart mutation, with `cartSelection` for its cart.
 */
const cartResult = (cartSelection: string) => /* GraphQL */ `
	cart {
		${cartSelection}
	}
	userErrors {
		field
		message
	}
	warnings {
		code
		message
	}
`;

const CART_RESULT = cartResult('...CartFields');

export const SHOP_QUERY = /* GraphQL */ `
	query Shop {
		shop {
			name
			description
		}
	}
`;

export const PRODUCTS_QUERY = /* GraphQL */ `
	query Products($first: Int!, $query: String, $sortKey: ProductSortKeys) {
		products(first: $first, query: $query, sortKey: $sortKey) {
			nodes {
				...ProductSummaryFields
			}
		}
	}
	${PRODUCT_SUMMARY}
`;

export const PRODUCT_QUERY = /* GraphQL */ `
	query Product($handle: String!) {
		product(handle: $handle) {
			...ProductFields
		}
	}
	${PRODUCT}
`;

export const PRODUCT_BY_ID_QUERY = /* GraphQL */ `
	query ProductById($id: ID!) {
		product(id: $id) {
			...ProductFields
		}
	}
	${PRODUCT}
`;

export const SHOP_POLICIES_QUERY = /* GraphQL */ `
	query ShopPolicies {
		shop {
			refundPolicy {
				...PolicyFields
			}
			shippingPolicy {
				...PolicyFields
			}
			privacyPolicy {
				...PolicyFields
			}
			termsOfService {
				...PolicyFields
			}
		}
	}
	fragment PolicyFields on ShopPolicy {
		handle
		title
		body
	}
`;

export const PRODUCT_VARIANTS_QUERY = /* GraphQL */ `
	query ProductVariants($handle: String!, $after: String!) {
		product(handle: $handle) {
			variants(first: ${PAGE_SIZE}, after: $after) {
				nodes {
					...VariantFields
				}
				pageInfo {
					...PageInfoFields
				}
			}
		}
	}
	${VARIANT}
	${PAGE_INFO}
	${MONEY}
`;

export const COLLECTIONS_QUERY = /* GraphQL */ `
	query Collections($first: Int!) {
		collections(first: $first) {
			nodes {
				id
				handle
				title
				description
			}
		}
	}
`;

export const COLLECTION_QUERY = /* GraphQL */ `
	query Collection($handle: String!, $first: Int!) {
		collection(handle: $handle) {
			id
			handle
			title
			description
			products(first: $first) {
				nodes {
					...ProductSummaryFields
				}
			}
		}
	}
	${PRODUCT_SUMMARY}
`;

export const CART_QUERY = /* GraphQL */ `
	query Cart($id: ID!) {
		cart(id: $id) {
			...CartFields
		}
	}
	${CART}
`;

export const CART_LINES_QUERY = /* GraphQL */ `
	query CartLines($id: ID!, $after: String!) {
		cart(id: $id) {
			lines(first: ${PAGE_SIZE}, after: $after) {
				nodes {
					...CartLineFields
				}
				pageInfo {
					...PageInfoFields
				}
			}
		}
	}
	${CART_LINE}
	${PAGE_INFO}
	${MONEY}
	${IMAGE}
`;

export const CART_CREATE_MUTATION = /* GraphQL */ `
	mutation CartCreate($lines: [CartLineInput!]) {
		cartCreate(input: { lines: $lines }) {
			${CART_RESULT}
		}
	}
	${CART}
`;

/**
 * Reads a cart and whether variants it may add are on sale, in one request.
 */
export const CART_STATE_QUERY = /* GraphQL */ `
	query CartState($id: ID!, $variants: [ID!]!) {
		cart(id: $id) {
			...CartFields
		}
		variants: nodes(ids: $variants) {
			... on ProductVariant {
				id
				availableForSale
			}
		}
	}
	${CART}
`;

/**
 * The fields a `cartChangeMutation` request can carry, named by their variables. They run in this order, as GraphQL
 * runs the fields of a mutation one after another.
 */
export const CART_CHANGE_FIELDS = [
	{ name: 'add', variable: '$add: [CartLineInput!]!', field: 'cartLinesAdd(cartId: $cartId, lines: $add)' },
	{
		name: 'update',
		variable: '$update: [CartLineUpdateInput!]!',
		field: 'cartLinesUpdate(cartId: $cartId, lines: $update)',
	},
	{ name: 'remove', variable: '$remove: [ID!]!', field: 'cartLinesRemove(cartId: $cartId, lineIds: $remove)' },
] as const;

export type CartChangeField = (typeof CART_CHANGE_FIELDS)[number]['name'];

/**
 * One mutation that applies the listed cart changes. Only the last field selects the whole cart, which is the cart
 * after every change.
 */
export function cartChangeMutation(names: readonly CartChangeField[]): string {
	const fields = CART_CHANGE_FIELDS.filter((entry) => names.includes(entry.name));
	const selection = (index: number) => (index === fields.length - 1 ? CART_RESULT : cartResult('id'));
	return /* GraphQL */ `
	mutation CartChange($cartId: ID!, ${fields.map((entry) => entry.variable).join(', ')}) {
		${fields.map((entry, index) => `${entry.name}: ${entry.field} {${selection(index)}}`).join('\n\t\t')}
	}
	${CART}
`;
}
