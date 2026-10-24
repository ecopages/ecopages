import type { EcoPageFile } from '@ecopages/core';
import type { ComponentRenderInput, RouteRendererBody } from '@ecopages/core/integration';
import { HttpError } from '@ecopages/core/errors';
import {
	createIntegrationRenderer,
	type IntegrationRendererHookFactory,
	type IntegrationRendererHookFactoryOptions,
} from '@ecopages/core/integration';
import { resolveQueuedTokens } from '@ecopages/core/integration';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { renderToString, withServerCustomElementRenderHook } from '@ecopages/jsx/server';
import {
	isMdxFile,
	normalizeMdxPageModule,
	type AsyncEcoComponent,
	type EcopagesJsxMdxPageModule,
} from './ecopages-jsx-mdx.ts';
import { recordEjsxHmrOwnership, withEjsxHmrOwnershipScope } from './ecopages-jsx-hmr-ownership.ts';
import { EcopagesJsxRadiantSsrPolicy } from './ecopages-jsx-radiant-ssr-policy.ts';
import { CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES, CustomElementScriptPreloader } from '@ecopages/core/integration';
import { requireAppRuntime } from '@ecopages/core/integration';
import { createSharedServerModuleImporter } from '@ecopages/core/integration';
import type { EcopagesJsxRendererConfig } from './ecopages-jsx.types.ts';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';

export type { EcopagesJsxRendererConfig } from './ecopages-jsx.types.ts';

export type EcopagesJsxRenderer = InstanceType<ReturnType<typeof createEcopagesJsxRenderer>>;

/** Creates the hook-based Ecopages JSX renderer for one plugin configuration. */
export function createEcopagesJsxRenderer(
	jsxConfig: EcopagesJsxRendererConfig = {},
): ReturnType<typeof createIntegrationRenderer<JsxRenderable>> {
	return createIntegrationRenderer<JsxRenderable>(
		ECOPAGES_JSX_PLUGIN_NAME,
		createEcopagesJsxRendererHookFactory(jsxConfig),
	);
}

/** Creates JSX renderer hooks that can also configure a custom renderer subclass. */
export function createEcopagesJsxRendererHookFactory(
	jsxConfig: EcopagesJsxRendererConfig = {},
): IntegrationRendererHookFactory {
	const mdxExtensions = jsxConfig.mdxExtensions ?? ['.mdx'];

	return ({ appConfig, resolveDependencyPath }: IntegrationRendererHookFactoryOptions) => {
		const radiantSsrPolicy = new EcopagesJsxRadiantSsrPolicy(jsxConfig.radiantSsrEnabled ?? false);
		const ssrScriptPreloader = new CustomElementScriptPreloader({
			cacheScope: CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.ecopagesJsx,
			preloadScopes: requireAppRuntime(appConfig).customElementSsrPreloadScopes,
			collectForIntegration: ECOPAGES_JSX_PLUGIN_NAME,
			enabled: jsxConfig.radiantSsrEnabled ?? false,
			logLabel: 'ecopages-jsx',
			resolveDependencyPath,
			importServerModule: createSharedServerModuleImporter(appConfig),
		});

		const withCustomElementRenderHook = async <T>(render: () => T): Promise<T> =>
			await radiantSsrPolicy.withRuntime(() =>
				withServerCustomElementRenderHook(
					({
						instance,
						applyChildren,
					}: {
						instance?: unknown;
						tagName: string;
						applyChildren?: () => void;
					}) =>
						instance ? radiantSsrPolicy.renderIntrinsicElementMarkup(instance, applyChildren) : undefined,
					render,
					{ ownsChildren: true },
				),
			);

		const renderJsx = async (value: JsxRenderable): Promise<string> =>
			await withCustomElementRenderHook(() => renderToString(value));

		const normalizeForeignChildProps = (input: {
			targetIntegration?: string;
			props: Record<string, unknown>;
		}): Record<string, unknown> => {
			if (!input.targetIntegration || input.targetIntegration === ECOPAGES_JSX_PLUGIN_NAME) {
				return input.props;
			}

			return normalizeForeignChildren(input.props);
		};

		return {
			beforeImportPageModule: async () => await radiantSsrPolicy.prepareRuntime(),
			normalizePageModule: <TPageModule extends EcoPageFile>(file: string, module: TPageModule): TPageModule =>
				isMdxFile(file, mdxExtensions)
					? (normalizeMdxPageModule(file, module as EcopagesJsxMdxPageModule) as TPageModule)
					: module,
			beforeRender: async (options) => {
				await radiantSsrPolicy.prepareRuntime();
				await ssrScriptPreloader.preloadSsrScripts([
					options.Page,
					options.Layout,
					options.HtmlTemplate,
					...(options.pageDependencyComponents ?? []),
				]);
			},
			renderComponent: async (input: ComponentRenderInput) => {
				await radiantSsrPolicy.prepareRuntime();
				await ssrScriptPreloader.preloadSsrScripts([input.component]);

				return await withEjsxHmrOwnershipScope(async () => {
					try {
						if (typeof input.component !== 'function') {
							throw new TypeError('JSX renderer expected a callable component.');
						}
						const component = input.component as AsyncEcoComponent<Record<string, unknown>>;
						const componentProps =
							input.children === undefined
								? input.props
								: {
										...input.props,
										children:
											typeof input.children === 'string'
												? createMarkupNodeLike(input.children)
												: input.children,
									};
						const content = await withCustomElementRenderHook(() => component(componentProps));
						const html = await renderJsx(content);

						recordEjsxHmrOwnership([input.component]);

						return {
							html,
							canAttachAttributes: true,
							integrationName: ECOPAGES_JSX_PLUGIN_NAME,
						};
					} catch (error) {
						throw createRenderError('Error rendering component', error);
					}
				});
			},
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) => {
				if (children === undefined) {
					return {};
				}

				const html = typeof children === 'string' ? children : await renderJsx(children as JsxRenderable);
				return { html: await resolveQueuedTokens(html, queuedResolutionsByToken, resolveToken) };
			},
			normalizeForeignChildProps: (input) => normalizeForeignChildProps(input),
			renderRoute: async (options, render): Promise<RouteRendererBody> =>
				await withEjsxHmrOwnershipScope(async () => {
					const body = await render();
					recordEjsxHmrOwnership([
						options.Page,
						options.Layout,
						options.HtmlTemplate,
						...(options.pageDependencyComponents ?? []),
					]);
					return body;
				}),
		};
	};
}

export const EcopagesJsxRenderer = createEcopagesJsxRenderer();

function normalizeForeignChildren(props: Record<string, unknown>): Record<string, unknown> {
	if (!('children' in props)) {
		return props;
	}

	const children = props.children;
	if (children === undefined || typeof children === 'string') {
		return props;
	}

	if (
		typeof children === 'object' &&
		children !== null &&
		'nodeType' in children &&
		typeof (children as { nodeType: unknown }).nodeType === 'number' &&
		'outerHTML' in children &&
		typeof (children as { outerHTML: unknown }).outerHTML === 'string'
	) {
		return {
			...props,
			children: (children as { outerHTML: string }).outerHTML,
		};
	}

	if (isJsxSerializableForeignChild(children)) {
		return {
			...props,
			children: renderToString(children as JsxRenderable),
		};
	}

	return props;
}

function isJsxSerializableForeignChild(children: unknown): boolean {
	if (Array.isArray(children)) {
		return true;
	}

	if (children === null || typeof children !== 'object') {
		return false;
	}

	if ('$$typeof' in children) {
		return true;
	}

	return 'strings' in children && Array.isArray((children as { strings: unknown }).strings);
}

function createRenderError(message: string, cause?: unknown): HttpError {
	if (HttpError.isHttpError(cause)) {
		return cause;
	}
	const errorMessage = cause instanceof Error ? `${message}: ${cause.message}` : message;
	return HttpError.InternalServerError(errorMessage);
}
