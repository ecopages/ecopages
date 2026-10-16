/**
 * This module contains the Lit renderer hooks.
 * @module
 */

import type {
	EcoComponent,
	EcoFunctionComponent,
	EcoPagesElement,
	PageParams,
	RouteRenderResult,
	RouteRendererOptions,
} from '@ecopages/core';
import {
	createIntegrationRenderer,
	type IntegrationRendererHookFactoryOptions,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { resolveQueuedTokens } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	CustomElementScriptPreloader,
	type CustomElementSsrPreloadComponent,
} from '@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-script-preloader';
import { requireAppRuntime } from '@ecopages/core/config/app-runtime';
import { createCustomElementServerModuleImporter } from '@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-server-module-importer';
import { ensureLitDomShim } from './dom-shim.ts';
import type { LitStaticRenderSession } from './lit-static-render-session.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import {
	injectLitRenderedChildren,
	LIT_COMPONENT_CHILDREN_SLOT_MARKER,
	normalizeLitHtml,
	renderLitValueToString,
} from './utils/lit-html-rendering.ts';

export type LitRenderer = InstanceType<ReturnType<typeof createLitRenderer>>;
export type LitRendererOptions = ConstructorParameters<ReturnType<typeof createLitRenderer>>[0];

/**
 * Creates the Lit renderer class with a lazy worker-session lookup.
 *
 * @remarks
 * The plugin may create its renderer before `setup()` assigns the static render session, so hooks read the
 * session when they run instead of capturing its construction-time value.
 */
export function createLitRenderer(
	getRenderSession: () => LitStaticRenderSession | undefined = () => undefined,
): ReturnType<typeof createIntegrationRenderer<EcoPagesElement>> {
	return createIntegrationRenderer<EcoPagesElement>(
		LIT_PLUGIN_NAME,
		({ appConfig, resolveComponentDependencies, resolveDependencyPath }: IntegrationRendererHookFactoryOptions) => {
			const ssrScriptPreloader = new CustomElementScriptPreloader({
				cacheScope: CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.lit,
				preloadScopes: requireAppRuntime(appConfig).customElementSsrPreloadScopes,
				logLabel: 'lit',
				requireLazyScriptEntry: true,
				resolveDependencyPath,
				importServerModule: createCustomElementServerModuleImporter(appConfig, '.lit-ssr'),
			});

			const preloadSsrScripts = async (
				components: Array<CustomElementSsrPreloadComponent | undefined>,
			): Promise<void> => {
				ensureLitDomShim();
				const renderSession = getRenderSession();
				if (renderSession) {
					await renderSession.preloadSsrScripts(components);
					return;
				}

				await ssrScriptPreloader.preloadSsrScripts(components);
			};

			return {
				beforeRender: async (renderOptions) =>
					preloadSsrScripts([
						renderOptions.Page,
						renderOptions.Layout,
						...(renderOptions.resolvedPageDependencyComponents ?? []),
					]),
				transformDocumentHtml: normalizeLitHtml,
				renderRemote: (routeOptions) => renderLitPageInWorker(routeOptions, getRenderSession),
				renderComponent: async (input) => {
					await preloadSsrScripts([input.component]);

					if (!isFunctionComponent(input.component)) {
						throw new TypeError('Lit renderer expected a callable component.');
					}

					const component = input.component;
					let renderedChildren: string | undefined;
					if (input.children !== undefined) {
						renderedChildren =
							typeof input.children === 'string'
								? input.children
								: await renderLitValueToString(input.children);
					}

					const props =
						renderedChildren === undefined
							? input.props
							: {
									...input.props,
									children: LIT_COMPONENT_CHILDREN_SLOT_MARKER,
								};
					const content = await component(props);
					const renderedHtml = await renderLitValueToString(content);
					const html =
						renderedChildren === undefined
							? renderedHtml
							: injectLitRenderedChildren(renderedHtml, renderedChildren);
					const assets = input.component.config?.dependencies
						? await resolveComponentDependencies([input.component])
						: undefined;

					return {
						html,
						canAttachAttributes: true,
						integrationName: LIT_PLUGIN_NAME,
						assets,
					};
				},
				renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
					if (children === undefined) {
						return {};
					}

					if (typeof children !== 'string') {
						return { children };
					}

					return { html: await resolveQueuedTokens(children, queuedResolutionsByToken, resolveToken) };
				},
			};
		},
	);
}

export const LitRenderer = createLitRenderer();

function isFunctionComponent(
	component: EcoComponent,
): component is EcoFunctionComponent<Record<string, unknown>, Promise<EcoPagesElement> | EcoPagesElement> {
	return typeof component === 'function';
}

/**
 * Renders a Lit page route in its build-scoped worker when request data can cross the worker boundary.
 *
 * @remarks
 * Locals and explicit props stay in-process: locals are request objects, and the worker re-imports the route module.
 */
async function renderLitPageInWorker(
	options: RouteRendererOptions,
	getRenderSession: () => LitStaticRenderSession | undefined,
): Promise<RouteRenderResult | undefined> {
	const renderSession = getRenderSession();

	if (!renderSession || options.locals !== undefined || options.props !== undefined) {
		return undefined;
	}

	const params: PageParams = options.params ?? {};
	const result = await renderSession.renderPageInWorker({
		filePath: options.file,
		params,
		query: options.query,
	});

	const { html, ...metadata } = result;
	return { body: html, ...metadata };
}
