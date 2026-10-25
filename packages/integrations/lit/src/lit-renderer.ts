/**
 * This module contains the Lit renderer hooks.
 * @module
 */
import type { EcoComponent, EcoFunctionComponent, EcoPagesElement, PageParams } from '@ecopages/core';
import type { RouteRenderResult, RouteRendererOptions } from '@ecopages/core/integration';
import { createIntegrationRenderer, type IntegrationRendererHookFactoryOptions } from '@ecopages/core/integration';
import { resolveQueuedTokens } from '@ecopages/core/integration';
import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	CustomElementScriptPreloader,
	type CustomElementSsrPreloadComponent,
} from '@ecopages/core/integration';
import { requireAppRuntime } from '@ecopages/core/integration';
import { createCustomElementServerModuleImporter } from '@ecopages/core/integration';
import type { LitStaticRenderSession } from './lit-static-render-session.ts';
import { LIT_PLUGIN_NAME } from './lit.constants.ts';
import {
	injectLitRenderedChildren,
	LIT_COMPONENT_CHILDREN_SLOT_MARKER,
	normalizeLitHtml,
	renderLitValueToString,
} from './utils/lit-html-rendering.ts';

export type LitRenderer = InstanceType<ReturnType<typeof createLitRenderer>>;

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
		({ appConfig, resolveDependencyPath }: IntegrationRendererHookFactoryOptions) => {
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
						...(renderOptions.pageDependencyComponents ?? []),
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

					return {
						html,
						canAttachAttributes: true,
						integrationName: LIT_PLUGIN_NAME,
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
