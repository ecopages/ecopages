import { LocalsAccessError } from '@ecopages/core/errors/locals-access-error';
import type { HtmlTemplateProps, IntegrationRendererRenderOptions, RequestLocals } from '@ecopages/core';
import type { ReactNode } from 'react';

type PagePayloadOptions = {
	pageProps?: HtmlTemplateProps['pageProps'];
	params: IntegrationRendererRenderOptions<ReactNode>['params'];
	query: IntegrationRendererRenderOptions<ReactNode>['query'];
	safeLocals?: RequestLocals;
};

/**
 * Builds the serialized page payload React exposes to document shells and the browser.
 *
 * This keeps hydration payload shaping away from the renderer so the renderer can
 * stay focused on component orchestration instead of data serialization rules.
 */
export class ReactPagePayloadService {
	/**
	 * Creates the canonical page-props payload used by router hydration.
	 *
	 * React pages embedded in a non-React HTML shell still need to expose the same
	 * page-data contract as fully React-owned documents so navigation and hydration
	 * can read one shared document payload consistently.
	 */
	buildRouterPageDataScript(pageProps: HtmlTemplateProps['pageProps'] | undefined): string {
		const safeJson = JSON.stringify(pageProps || {}).replace(/</g, '\\u003c');
		return `<script id="__ECO_PAGE_DATA__" type="application/json">${safeJson}</script>`;
	}

	/**
	 * Builds the serialized page-props payload embedded into the final HTML.
	 *
	 * The document payload is intentionally narrower than the full server render
	 * input: only routing data, public page props, and explicitly allowed locals are
	 * exposed to the browser.
	 */
	buildSerializedPageProps(options: PagePayloadOptions): HtmlTemplateProps['pageProps'] {
		return {
			...options.pageProps,
			params: options.params,
			query: options.query,
			...(options.safeLocals && { locals: options.safeLocals }),
		};
	}

	/**
	 * Safely extracts the declared subset of locals for client-side hydration.
	 *
	 * On dynamic pages with `cache: 'dynamic'`, middleware populates `locals` with
	 * request-scoped data (e.g., session). Only keys explicitly declared via
	 * `Page.requires` are serialized to the client so sensitive request-only data
	 * is not leaked into hydration payloads by default.
	 *
	 * On static pages, `locals` is a Proxy that throws `LocalsAccessError` on access
	 * to prevent accidental use. This method safely detects that case and returns
	 * `undefined` instead of throwing.
	 */
	getSerializableLocals(
		locals: RequestLocals | undefined,
		requiredLocals?: string | readonly string[],
	): RequestLocals | undefined {
		try {
			if (!locals) {
				return undefined;
			}

			const requiredKeys = requiredLocals
				? Array.isArray(requiredLocals)
					? requiredLocals
					: [requiredLocals]
				: [];

			if (requiredKeys.length === 0) {
				return undefined;
			}

			const serializedLocals = Object.fromEntries(
				requiredKeys
					.filter((key) => Object.prototype.hasOwnProperty.call(locals, key))
					.map((key) => [key, locals[key as keyof RequestLocals]]),
			) as RequestLocals;

			if (Object.keys(serializedLocals).length > 0) {
				return serializedLocals;
			}

			return undefined;
		} catch (error) {
			if (error instanceof LocalsAccessError) {
				return undefined;
			}

			throw error;
		}
	}
}