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
	}
	${MONEY}
	${IMAGE}
`;

const PRODUCT = /* GraphQL */ `
	fragment ProductFields on Product {
		...ProductSummaryFields
		description
		productType
		tags
		options {
			name
			optionValues {
				name
			}
		}
		variants(first: 100) {
			nodes {
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
		}
		images(first: 10) {
			nodes {
				...ImageFields
			}
		}
	}
	${PRODUCT_SUMMARY}
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
		lines(first: 100) {
			nodes {
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
		}
	}
	${MONEY}
	${IMAGE}
`;

const CART_RESULT = /* GraphQL */ `
	cart {
		...CartFields
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

export const CART_CREATE_MUTATION = /* GraphQL */ `
	mutation CartCreate($lines: [CartLineInput!]) {
		cartCreate(input: { lines: $lines }) {
			${CART_RESULT}
		}
	}
	${CART}
`;

export const CART_LINES_ADD_MUTATION = /* GraphQL */ `
	mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
		cartLinesAdd(cartId: $cartId, lines: $lines) {
			${CART_RESULT}
		}
	}
	${CART}
`;

export const CART_LINES_UPDATE_MUTATION = /* GraphQL */ `
	mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
		cartLinesUpdate(cartId: $cartId, lines: $lines) {
			${CART_RESULT}
		}
	}
	${CART}
`;

export const CART_LINES_REMOVE_MUTATION = /* GraphQL */ `
	mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
		cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
			${CART_RESULT}
		}
	}
	${CART}
`;
