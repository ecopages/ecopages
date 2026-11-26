/**
 * The storefront's public URLs, shared by pages, `/llms.txt`, Markdown views, JSON-LD and MCP tools so every
 * surface links to the same place.
 */
export const storePaths = {
	product: (handle: string) => `/products/${encodeURIComponent(handle)}`,
	productMarkdown: (handle: string) => `/products/${encodeURIComponent(handle)}/index.md`,
	collection: (handle: string) => `/collections/${encodeURIComponent(handle)}`,
	search: (query = '') => (query ? `/search?q=${encodeURIComponent(query)}` : '/search'),
	policy: (handle: string) => `/policies/${encodeURIComponent(handle)}`,
	cart: '/cart',
	cartApi: '/api/cart',
	demoCheckout: '/demo-checkout',
	mcp: '/mcp',
	llms: '/llms.txt',
} as const;

/**
 * Makes a URL absolute against the site origin: a storefront path, or a URL a provider returned, which may be
 * root-relative or already absolute.
 */
export function resolveUrl(origin: string, url: string): string {
	return new URL(url, `${origin.replace(/\/+$/u, '')}/`).href;
}
