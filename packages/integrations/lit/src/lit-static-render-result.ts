import type { RouteRenderResult } from '@ecopages/core';
import type { LitStaticRenderResult } from './lit-static-render-protocol.ts';

/**
 * Turns a route render into the message the worker posts back to the main thread.
 *
 * @remarks
 * The resolved `metadata` travels with the HTML so the main thread can decide sitemap eligibility
 * from the render instead of loading the page again.
 */
export async function toLitStaticRenderResult(result: RouteRenderResult): Promise<LitStaticRenderResult> {
	const { body, cacheStrategy, sourceDependencyPaths, metadata } = result;
	const rendered = { cacheStrategy, sourceDependencyPaths, metadata };

	if (typeof body === 'string') {
		return { html: body, ...rendered };
	}

	if (Buffer.isBuffer(body)) {
		return { html: body.toString('utf8'), ...rendered };
	}

	if (body instanceof ReadableStream) {
		return { html: await new Response(body).text(), ...rendered };
	}

	throw new TypeError(`Unsupported Lit static render body type: ${typeof body}`);
}
