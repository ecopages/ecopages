/**
 * The storefront's public URLs, shared by pages, `/llms.txt`, Markdown views, JSON-LD and MCP tools so every
 * surface links to the same place.
 */
export const storePaths = {
	product: (handle: string) => `/products/${encodeURIComponent(handle)}`,
	productMarkdown: (handle: string) => `/products/${encodeURIComponent(handle)}.md`,
	collection: (handle: string) => `/collections/${encodeURIComponent(handle)}`,
	search: (query = '') => (query ? `/search?q=${encodeURIComponent(query)}` : '/search'),
	policy: (handle: string) => `/policies/${encodeURIComponent(handle)}`,
	cart: '/cart',
	cartApi: '/api/cart',
	agentTool: (name: string) => `/api/agent-tools/${encodeURIComponent(name)}`,
	demoCheckout: '/demo-checkout',
	mcp: '/mcp',
	ucpProfile: '/.well-known/ucp',
	ucpMcp: '/api/ucp/mcp',
	llms: '/llms.txt',
} as const;

/**
 * The handles Shopify gives the standard policies, which the demo catalog uses too.
 */
export const POLICY_HANDLES = {
	shipping: 'shipping-policy',
	refund: 'refund-policy',
	privacy: 'privacy-policy',
	terms: 'terms-of-service',
} as const;

/**
 * The product handle in a `/products/<handle>` path or URL, or its Markdown view `/products/<handle>.md`;
 * `null` for any other path.
 */
export function productHandleFromPath(path: string): string | null {
	const match = /^(?:https?:\/\/[^/]+)?\/products\/([^/?#]+?)(?:\.md|\/)?(?:[?#].*)?$/u.exec(path);
	return match ? decodeURIComponent(match[1] ?? '') : null;
}

/**
 * Makes a URL absolute against the site origin: a storefront path, or a URL a provider returned, which may be
 * root-relative or already absolute.
 */
export function resolveUrl(origin: string, url: string): string {
	return new URL(url, `${origin.replace(/\/+$/u, '')}/`).href;
}
