import { LocalsAccessError } from '@ecopages/core/errors';
import {
	serializePageDataManifestScript,
	serializePageDataScript,
	type EcoPageDataProps,
} from '../serialize-page-data-script.ts';
import type { HtmlTemplateProps, IntegrationRendererRenderOptions, RequestLocals } from '@ecopages/core';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type { ReactNode } from 'react';

type PagePayloadOptions = {
	pageProps?: HtmlTemplateProps['pageProps'];
	params: IntegrationRendererRenderOptions<ReactNode>['params'];
	query: IntegrationRendererRenderOptions<ReactNode>['query'];
	safeLocals?: RequestLocals;
};

type PagePackage = IntegrationRendererRenderOptions<ReactNode>['pagePackage'];

/**
 * Builds the serialized page payload React exposes to document shells and the browser.
 *
 * @remarks
 * Keeps hydration payload shaping away from the renderer so orchestration stays
 * focused on component composition instead of document serialization rules.
 */
export class ReactPagePayloadService {
	/**
	 * Resolves the browser-importable page module URL from processed page entry assets.
	 */
	resolvePageModuleUrl(
		pagePackage: PagePackage | undefined,
		options: { routerEnabled: boolean },
	): string | undefined {
		if (!options.routerEnabled) {
			return undefined;
		}

		const entryScripts =
			pagePackage?.pageBrowserGraph?.entryAssets.filter(
				(asset): asset is ProcessedAsset & { srcUrl: string } =>
					asset.kind === 'script' && typeof asset.srcUrl === 'string',
			) ?? [];
		const bootstrapScript = entryScripts.find(
			(asset) => asset.attributes?.['data-eco-page-bootstrap'] === 'react-router',
		);

		return bootstrapScript?.srcUrl ?? entryScripts[0]?.srcUrl;
	}

	/**
	 * Creates the `__ECO_PAGE_DATA__` script for router hydration.
	 *
	 * @remarks
	 * When `moduleUrl` is present, emits the v1 envelope via
	 * {@link serializePageDataManifestScript}. Otherwise emits legacy flat props
	 * for non-router shells.
	 */
	buildRouterPageDataScript(pageProps: HtmlTemplateProps['pageProps'] | undefined, moduleUrl?: string): string {
		const props = { ...((pageProps ?? {}) as EcoPageDataProps) };
		if (moduleUrl) {
			return serializePageDataManifestScript({ moduleUrl, props });
		}
		return serializePageDataScript(props);
	}

	/**
	 * Builds the browser-safe page-props object embedded into the final HTML.
	 *
	 * @remarks
	 * Narrower than the full server render input: only routing data, public page
	 * props, and explicitly allowed locals. Page module identity is threaded via
	 * `HtmlTemplateProps.pageModuleUrl`, not serialized page props.
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
