import {
	serializePageDataManifestScript,
	serializePageDataScript,
	type EcoPageDataProps,
} from './serialize-page-data-script.ts';
import type { EcoComponentConfig, HtmlTemplateProps } from '@ecopages/core';
import type { IntegrationRendererRenderOptions } from '@ecopages/core/integration';
import type { ProcessedAsset } from '@ecopages/core/integration';
import type { HtmlDocumentContribution } from '@ecopages/core/integration';
import type { ReactNode } from 'react';
import { isReactManagedComponent } from '../render/component-ownership.ts';
import { ECO_PAGE_DATA_TIERS_KEY } from './page-data-manifest.ts';

type PagePayloadOptions = {
	pageProps?: HtmlTemplateProps['pageProps'];
	params: IntegrationRendererRenderOptions<ReactNode>['params'];
	query: IntegrationRendererRenderOptions<ReactNode>['query'];
	/** The props each layout tier renders with, outer to inner, as the server resolved them. */
	layoutTiers?: readonly Record<string, unknown>[];
};

type PagePackage = IntegrationRendererRenderOptions<ReactNode>['pagePackage'];

/**
 * Builds the serialized page payload React exposes to document shells and the browser.
 *
 * @remarks
 * Keeps hydration payload shaping away from the renderer so orchestration stays
 * focused on component composition instead of document serialization rules.
 */
export class PagePayloadService {
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
	 * Builds shared document html contributions for router-backed React pages rendered
	 * through a non-React HTML shell.
	 */
	buildNonReactDocumentContributions(options: {
		htmlTemplate: { config?: EcoComponentConfig } | null | undefined;
		pageProps: Record<string, unknown>;
		pageModuleUrl?: string;
		reactIntegrationName: string;
		routerEnabled: boolean;
	}): HtmlDocumentContribution[] | undefined {
		if (isReactManagedComponent(options.htmlTemplate, options.reactIntegrationName) || !options.routerEnabled) {
			return undefined;
		}

		return [
			{
				placement: 'head-append',
				html: this.buildRouterPageDataScript(options.pageProps, options.pageModuleUrl),
			},
		];
	}

	/**
	 * Builds the browser-safe page-props object embedded into the final HTML.
	 *
	 * @remarks
	 * Carries what the Page's `props` hook returned, its Params and Query, and the layout tier props. Request
	 * `locals` never reach it: a Page that needs a value from them returns it from `props`. Page module identity is
	 * threaded via `HtmlTemplateProps.pageModuleUrl`, not serialized page props.
	 */
	buildSerializedPageProps(options: PagePayloadOptions): HtmlTemplateProps['pageProps'] {
		return {
			...options.pageProps,
			params: options.params,
			query: options.query,
			...(options.layoutTiers && { [ECO_PAGE_DATA_TIERS_KEY]: options.layoutTiers }),
		};
	}
}
