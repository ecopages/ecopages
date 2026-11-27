import type { ApiHandlerContext } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { buildLlmsTxt } from '@/lib/agents/llms-txt';
import { buildProductMarkdown } from '@/lib/agents/product-markdown';
import { CATALOG_REVALIDATE_SECONDS } from '@/lib/commerce/cache-tags';
import { getCommerce } from '@/lib/commerce/provider.server';
import { siteOrigin } from '@/lib/site-origin';
import { handleUcpProfile } from '@/lib/ucp/ucp.server';

const cacheControl = `public, max-age=${CATALOG_REVALIDATE_SECONDS}`;

/**
 * Serves `/llms.txt`.
 */
export async function llmsTxtHandler(): Promise<Response> {
	return new Response(await buildLlmsTxt(getCommerce(), siteOrigin), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cacheControl },
	});
}

/**
 * Serves `/.well-known/ucp`: the connected Shopify store's UCP profile, with its endpoint pointed at this site.
 */
export async function ucpProfileHandler(): Promise<Response> {
	return handleUcpProfile({ provider: getCommerce() });
}

/**
 * Serves a product's Markdown view at `/products/:handle.md`.
 */
export async function productMarkdownHandler({ params }: ApiHandlerContext): Promise<Response> {
	const product = await getCommerce().getProduct(String(params.handle));
	if (!product) throw HttpError.NotFound('Product not found');
	return new Response(buildProductMarkdown(product, siteOrigin), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': cacheControl },
	});
}
