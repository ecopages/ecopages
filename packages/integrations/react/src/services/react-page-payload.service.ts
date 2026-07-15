import { LocalsAccessError } from '@ecopages/core/errors';
import {
	ECO_PAGE_MODULE_PROP,
	serializePageDataManifestScript,
	serializePageDataScript,
	type EcoPageDataProps,
} from '../serialize-page-data-script.ts';
import type { HtmlTemplateProps, IntegrationRendererRenderOptions, RequestLocals } from '@ecopages/core';
import type { ReactNode } from 'react';

type PagePayloadOptions = {
	pageProps?: HtmlTemplateProps['pageProps'];
	params: IntegrationRendererRenderOptions<ReactNode>['params'];
	query: IntegrationRendererRenderOptions<ReactNode>['query'];
	safeLocals?: RequestLocals;
	pageModuleUrl?: string;
};

/**
 * Builds the serialized page payload React exposes to document shells and the browser.
 *
 * @remarks
 * Keeps hydration payload shaping away from the renderer so orchestration stays
 * focused on component composition instead of document serialization rules.
 */
export class ReactPagePayloadService {
	/**
	 * Creates the `__ECO_PAGE_DATA__` script for router hydration.
	 *
	 * @remarks
	 * When `moduleUrl` (or {@link ECO_PAGE_MODULE_PROP} on `pageProps`) is present,
	 * emits the v1 envelope. Otherwise emits legacy flat props for non-router shells.
	 * The reserved module key is always stripped from the props object.
	 */
	buildRouterPageDataScript(pageProps: HtmlTemplateProps['pageProps'] | undefined, moduleUrl?: string): string {
		const props = { ...((pageProps ?? {}) as EcoPageDataProps) };
		const resolvedModuleUrl =
			moduleUrl ?? (typeof props[ECO_PAGE_MODULE_PROP] === 'string' ? props[ECO_PAGE_MODULE_PROP] : undefined);
		delete props[ECO_PAGE_MODULE_PROP];

		if (!resolvedModuleUrl) {
			return serializePageDataScript(props);
		}

		return serializePageDataManifestScript({
			module: resolvedModuleUrl,
			props,
		});
	}

	/**
	 * Builds the browser-safe page-props object embedded into the final HTML.
	 *
	 * @remarks
	 * Narrower than the full server render input: only routing data, public page
	 * props, explicitly allowed locals, and the reserved module transport key.
	 */
	buildSerializedPageProps(options: PagePayloadOptions): HtmlTemplateProps['pageProps'] {
		return {
			...options.pageProps,
			params: options.params,
			query: options.query,
			...(options.safeLocals && { locals: options.safeLocals }),
			...(options.pageModuleUrl && { [ECO_PAGE_MODULE_PROP]: options.pageModuleUrl }),
		};
	}

	/**
	 * Extracts the declared subset of locals for client-side hydration.
	 *
	 * @remarks
	 * On dynamic pages with `cache: 'dynamic'`, middleware populates `locals` with
	 * request-scoped data. Only keys declared via `Page.requires` are serialized.
	 * On static pages, `locals` is a Proxy that throws `LocalsAccessError`; this
	 * method returns `undefined` instead of throwing.
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
