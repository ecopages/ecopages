/**
 * This module contains the React renderer
 * @module
 */

import path from 'node:path';
import type {
	EcoComponent,
	EcoComponentConfig,
	EcoPageFile,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { rapidhash } from '@ecopages/core/hash';
import { AssetFactory, type ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { createElement, type JSX } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import type { CompileOptions } from '@mdx-js/mdx';
import { PLUGIN_NAME } from './react.plugin.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import { createHydrationScript } from './utils/hydration-scripts.ts';

/**
 * Error thrown when an error occurs while rendering a React component.
 */
export class ReactRenderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReactRenderError';
	}
}

/**
 * Error thrown when an error occurs while bundling a React component.
 */
export class BundleError extends Error {
	constructor(
		message: string,
		public readonly logs: string[],
	) {
		super(message);
		this.name = 'BundleError';
	}
}

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<JSX.Element> {
	name = PLUGIN_NAME;
	componentDirectory = RESOLVED_ASSETS_DIR;
	static routerAdapter: ReactRouterAdapter | undefined;
	static mdxCompilerOptions: CompileOptions | undefined;
	static mdxExtensions: string[] = ['.mdx'];

	/**
	 * Checks if the given file path corresponds to an MDX file based on configured extensions.
	 * @param filePath - The file path to check
	 * @returns True if the file is an MDX file
	 */
	public isMdxFile(filePath: string): boolean {
		return ReactRenderer.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	/**
	 * Resolves the import path for the bundled page component.
	 * Uses HMR manager for development or constructs static path for production.
	 * @param pagePath - Absolute path to the page source file
	 * @param componentName - Generated unique component name
	 * @returns The resolved import path for the bundled component
	 */
	private async resolveAssetImportPath(pagePath: string, componentName: string): Promise<string> {
		const hmrManager = this.assetProcessingService?.getHmrManager();

		if (hmrManager?.isEnabled()) {
			return hmrManager.registerEntrypoint(pagePath);
		}

		return `/${path
			.join(RESOLVED_ASSETS_DIR, path.relative(this.appConfig.srcDir, pagePath))
			.replace(path.basename(pagePath), `${componentName}.js`)
			.replace(/\\/g, '/')}`;
	}

	/**
	 * Creates bundle configuration options for the page component.
	 * Configures externals, naming, and MDX plugin when applicable.
	 * @param componentName - Generated unique component name for output naming
	 * @param isMdx - Whether the source file is an MDX file
	 * @returns Bundle options object for Bun.build
	 */
	private async createBundleOptions(componentName: string, isMdx: boolean): Promise<Record<string, unknown>> {
		const options: Record<string, unknown> = {
			external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
			naming: `${componentName}.[ext]`,
			...(import.meta.env.NODE_ENV === 'production' && {
				minify: true,
				splitting: false,
				treeshaking: true,
			}),
		};

		if (isMdx && ReactRenderer.mdxCompilerOptions) {
			const mdx = (await import('@mdx-js/esbuild')).default;
			options.plugins = [mdx(ReactRenderer.mdxCompilerOptions)];
		}

		return options;
	}

	/**
	 * Creates the asset dependencies for a page: the bundled component and hydration script.
	 * @param pagePath - Absolute path to the page source file
	 * @param componentName - Generated unique component name
	 * @param importPath - Resolved import path for the bundled component
	 * @param bundleOptions - Bundle configuration options
	 * @param isDevelopment - Whether running in development mode with HMR
	 * @param isMdx - Whether the source file is an MDX file
	 * @returns Array of asset definitions for processing
	 */
	private createPageDependencies(
		pagePath: string,
		componentName: string,
		importPath: string,
		bundleOptions: Record<string, unknown>,
		isDevelopment: boolean,
		isMdx: boolean,
	) {
		return [
			AssetFactory.createFileScript({
				position: 'head',
				filepath: pagePath,
				name: componentName,
				excludeFromHtml: true,
				bundle: true,
				bundleOptions,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-persist': 'true',
				},
			}),
			AssetFactory.createContentScript({
				position: 'head',
				content: createHydrationScript({
					importPath,
					isDevelopment,
					isMdx,
					router: ReactRenderer.routerAdapter,
				}),
				name: `${componentName}-hydration`,
				bundle: false,
				attributes: {
					type: 'module',
					defer: '',
					'data-eco-persist': 'true',
				},
			}),
		];
	}

	/**
	 * Processes MDX-specific configuration dependencies including layout dependencies.
	 * @param pagePath - Absolute path to the MDX page file
	 * @returns Processed assets for MDX configuration dependencies
	 */
	private async processMdxConfigDependencies(pagePath: string): Promise<ProcessedAsset[]> {
		const { config } = await this.importPageFile(pagePath);
		const resolvedLayout = config?.layout;
		const components: Partial<EcoComponent>[] = [];

		if (resolvedLayout?.config?.dependencies) {
			components.push({ config: resolvedLayout.config });
		}

		if (config?.dependencies) {
			const configWithMeta = {
				...config,
				__eco: { dir: path.dirname(pagePath), integration: 'react' },
			};
			components.push({ config: configWithMeta });
		}

		return this.processComponentDependencies(components);
	}

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const isMdx = this.isMdxFile(pagePath);
			const componentName = `ecopages-react-${rapidhash(pagePath)}`;
			const hmrManager = this.assetProcessingService?.getHmrManager();
			const isDevelopment = hmrManager?.isEnabled() ?? false;

			const importPath = await this.resolveAssetImportPath(pagePath, componentName);
			const bundleOptions = await this.createBundleOptions(componentName, isMdx);
			const dependencies = this.createPageDependencies(
				pagePath,
				componentName,
				importPath,
				bundleOptions,
				isDevelopment,
				isMdx,
			);

			if (!this.assetProcessingService) {
				throw new Error('AssetProcessingService is not set');
			}

			const processedAssets = await this.assetProcessingService.processDependencies(dependencies, componentName);

			if (isMdx) {
				const mdxConfigAssets = await this.processMdxConfigDependencies(pagePath);
				return [...processedAssets, ...mdxConfigAssets];
			}

			return processedAssets;
		} catch (error) {
			if (error instanceof BundleError) {
				console.error('[ecopages] Bundle errors:', error.logs);
			}

			throw new ReactRenderError(
				`Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	protected override async importPageFile(file: string): Promise<EcoPageFile<{ config?: EcoComponentConfig }>> {
		const module = await import(file);
		const { default: Page, getMetadata, config } = module;

		if (this.isMdxFile(file) && config) {
			Page.config = config;
		}

		return {
			default: Page,
			getMetadata,
			config,
		};
	}

	async render({
		params,
		query,
		props,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
		pageProps,
	}: IntegrationRendererRenderOptions<JSX.Element>): Promise<RouteRendererBody> {
		try {
			const pageElement = createElement(Page, { params, query, ...props });
			const contentElement = Layout
				? createElement(Layout as React.FunctionComponent<{ children: JSX.Element }>, null, pageElement)
				: pageElement;

			return await renderToReadableStream(
				createElement(
					HtmlTemplate,
					{
						metadata,
						pageProps: pageProps || {},
					} as HtmlTemplateProps,
					contentElement,
				),
			);
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
	}

	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const viewConfig = view.config;
			const Layout = viewConfig?.layout as React.FunctionComponent<{ children: JSX.Element }> | undefined;

			const ViewComponent = view as unknown as React.FunctionComponent;
			const pageElement = createElement(ViewComponent, props || {});

			let stream: ReadableStream;
			if (ctx.partial) {
				stream = await renderToReadableStream(pageElement);
			} else {
				const contentElement = Layout ? createElement(Layout, undefined, pageElement) : pageElement;

				const HtmlTemplate = await this.getHtmlTemplate();
				const metadata: PageMetadataProps = view.metadata
					? await view.metadata({
							params: {},
							query: {},
							props,
							appConfig: this.appConfig,
						})
					: this.appConfig.defaultMetadata;

				stream = await renderToReadableStream(
					createElement(
						HtmlTemplate,
						{
							metadata,
							pageProps: props,
						} as HtmlTemplateProps,
						contentElement,
					),
				);
			}

			return this.createHtmlResponse(stream, ctx);
		} catch (error) {
			throw this.createRenderError('Failed to render view', error);
		}
	}
}
