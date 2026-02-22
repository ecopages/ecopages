/**
 * This module contains the React renderer
 * @module
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
	EcoComponent,
	EcoComponentConfig,
	EcoPageFile,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RequestLocals,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { LocalsAccessError } from '@ecopages/core/errors/locals-access-error';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { rapidhash } from '@ecopages/core/hash';
import {
	AssetFactory,
	type AssetDefinition,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import { defaultBuildAdapter } from '@ecopages/core/build/build-adapter';
import { fileSystem } from '@ecopages/file-system';
import { createElement, type ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import type { CompileOptions } from '@mdx-js/mdx';
import { PLUGIN_NAME } from './react.plugin.ts';
import type { ReactRouterAdapter } from './router-adapter.ts';
import { createHydrationScript } from './utils/hydration-scripts.ts';
import { createClientGraphBoundaryPlugin } from './utils/client-graph-boundary-plugin.ts';

function parseDeclaredModuleSource(value: string): string | undefined {
	const source = value.trim();
	if (source.length === 0) return undefined;
	const openBraceIndex = source.indexOf('{');
	if (openBraceIndex < 0) return source;
	const from = source.slice(0, openBraceIndex).trim();
	return from.length > 0 ? from : undefined;
}

function normalizeDeclaredModuleSources(modules?: string[]): string[] {
	const seen = new Set<string>();
	for (const declaration of modules ?? []) {
		const from = parseDeclaredModuleSource(declaration);
		if (from) {
			seen.add(from);
		}
	}
	return Array.from(seen);
}

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
export class ReactRenderer extends IntegrationRenderer<ReactNode> {
	name = PLUGIN_NAME;
	componentDirectory = RESOLVED_ASSETS_DIR;
	static routerAdapter: ReactRouterAdapter | undefined;
	static mdxCompilerOptions: CompileOptions | undefined;
	static mdxExtensions: string[] = ['.mdx'];
	/**
	 * Enables explicit graph behavior for React page-entry bundling.
	 *
	 * When true, page-entry bundles disable AST server-only stripping and rely
	 * on explicit dependency declarations for browser graph composition.
	 */
	static explicitGraphEnabled = false;

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
	private async createBundleOptions(
		componentName: string,
		isMdx: boolean,
		declaredModules: string[],
	): Promise<Record<string, unknown>> {
		const options: Record<string, unknown> = {
			external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
			naming: `${componentName}.[ext]`,
			...(import.meta.env?.NODE_ENV === 'production' && {
				minify: true,
				splitting: false,
				treeshaking: true,
			}),
		};

		const graphBoundaryPlugin = createClientGraphBoundaryPlugin({
			absWorkingDir: this.appConfig.rootDir,
			declaredModules,
			alwaysAllowSpecifiers: [
				'@ecopages/core',
				'react',
				'react-dom',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				'react-dom/client',
				...(ReactRenderer.routerAdapter ? [ReactRenderer.routerAdapter.importMapKey] : []),
			],
		});

		if (isMdx && ReactRenderer.mdxCompilerOptions) {
			const { createMdxLoaderPlugin } = await import('@ecopages/mdx/mdx-loader-plugin');
			const mdxPlugin = await createMdxLoaderPlugin(ReactRenderer.mdxCompilerOptions);
			options.plugins = [mdxPlugin, graphBoundaryPlugin];
		} else {
			options.plugins = [graphBoundaryPlugin];
		}

		return options;
	}

	/**
	 * Creates the asset dependencies for a page: the bundled component and hydration script.
	 *
	 * The dependencies include:
	 * 1. Bundled component: The actual React component module
	 * 2. Hydration script: Initializes React on the client side and sets window.__ECO_PAGE__
	 *
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
		props?: Record<string, unknown>,
	): AssetDefinition[] {
		const dependencies: AssetDefinition[] = [
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
		];

		if (props && Object.keys(props).length > 0) {
			dependencies.push(
				AssetFactory.createContentScript({
					position: 'head',
					content: `window.__ECO_PAGE__={module:"${importPath}",props:${JSON.stringify(props)}};`,
					name: `${componentName}-props`,
					bundle: false,
					attributes: {
						type: 'module',
					},
				}),
			);
		}

		dependencies.push(
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
		);

		return dependencies;
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
			const layoutConfig = this.ensureConfigFileMetadata(resolvedLayout.config, pagePath);
			components.push({ config: layoutConfig });
		}

		if (config?.dependencies) {
			const configWithMeta = {
				...config,
				__eco: { id: rapidhash(pagePath).toString(36), file: pagePath, integration: 'react' },
			};
			components.push({ config: configWithMeta });
		}

		return this.processComponentDependencies(components);
	}

	private ensureConfigFileMetadata(config: EcoComponentConfig, pagePath: string): EcoComponentConfig {
		if (config.__eco?.file) {
			return config;
		}

		const buildEcoMeta = (file: string) => ({
			id: config.__eco?.id ?? rapidhash(file).toString(36),
			integration: config.__eco?.integration ?? this.name,
			file,
		});

		const dependencyPaths = [
			...(config.dependencies?.stylesheets ?? []),
			...(config.dependencies?.scripts ?? []),
			...(config.dependencies?.lazy?.scripts ?? []),
		].filter((value) => value.startsWith('./') || value.startsWith('../'));

		const candidateDirs = [
			this.appConfig.absolutePaths.layoutsDir,
			this.appConfig.absolutePaths.componentsDir,
			path.dirname(pagePath),
		].filter((value): value is string => typeof value === 'string' && value.length > 0);

		for (const dependencyPath of dependencyPaths) {
			for (const candidateDir of candidateDirs) {
				const resolvedDependency = path.resolve(candidateDir, dependencyPath);
				if (fileSystem.exists(resolvedDependency)) {
					return {
						...config,
						__eco: buildEcoMeta(resolvedDependency),
					};
				}
			}
		}

		return {
			...config,
			__eco: buildEcoMeta(pagePath),
		};
	}

	private hasModulesInConfig(config: EcoComponentConfig | undefined, visited = new Set<EcoComponentConfig>()): boolean {
		if (!config || visited.has(config)) {
			return false;
		}

		visited.add(config);

		if (config.dependencies?.modules?.some((entry) => entry.trim().length > 0)) {
			return true;
		}

		if (config.layout?.config && this.hasModulesInConfig(config.layout.config, visited)) {
			return true;
		}

		for (const component of config.dependencies?.components ?? []) {
			if (this.hasModulesInConfig(component.config, visited)) {
				return true;
			}
		}

		return false;
	}

	private async shouldHydratePage(pagePath: string): Promise<boolean> {
		if (ReactRenderer.routerAdapter) {
			return true;
		}

		const pageModule = (await this.importPageFile(pagePath)) as EcoPageFile<{ config?: EcoComponentConfig }> & {
			config?: EcoComponentConfig;
		};
		const pageConfig = pageModule.default?.config;
		return this.hasModulesInConfig(pageConfig) || this.hasModulesInConfig(pageModule.config);
	}

	private collectDeclaredModulesInConfig(
		config: EcoComponentConfig | undefined,
		visited = new Set<EcoComponentConfig>(),
	): string[] {
		if (!config || visited.has(config)) {
			return [];
		}

		visited.add(config);

		const declarations = normalizeDeclaredModuleSources(config.dependencies?.modules);

		if (config.layout?.config) {
			declarations.push(...this.collectDeclaredModulesInConfig(config.layout.config, visited));
		}

		for (const component of config.dependencies?.components ?? []) {
			if (component.config) {
				declarations.push(...this.collectDeclaredModulesInConfig(component.config, visited));
			}
		}

		return declarations;
	}

	private async collectPageDeclaredModules(pagePath: string): Promise<string[]> {
		const pageModule = (await this.importPageFile(pagePath)) as EcoPageFile<{ config?: EcoComponentConfig }> & {
			config?: EcoComponentConfig;
		};

		const declarations = [
			...this.collectDeclaredModulesInConfig(pageModule.default?.config),
			...this.collectDeclaredModulesInConfig(pageModule.config),
		];

		return Array.from(new Set(declarations));
	}

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const shouldHydrate = ReactRenderer.explicitGraphEnabled ? true : await this.shouldHydratePage(pagePath);
			if (!shouldHydrate) {
				return [];
			}

			const isMdx = this.isMdxFile(pagePath);
			const componentName = `ecopages-react-${rapidhash(pagePath)}`;
			const hmrManager = this.assetProcessingService?.getHmrManager();
			const isDevelopment = hmrManager?.isEnabled() ?? false;

			const importPath = await this.resolveAssetImportPath(pagePath, componentName);
			const declaredModules = await this.collectPageDeclaredModules(pagePath);
			const bundleOptions = await this.createBundleOptions(componentName, isMdx, declaredModules);
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
		const module = (
			this.isMdxFile(file) ? await this.importMdxPageFile(file) : await super.importPageFile(file)
		) as EcoPageFile<{ config?: EcoComponentConfig }> & {
			config?: EcoComponentConfig;
		};
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

	private async importMdxPageFile(filePath: string): Promise<unknown> {
		const { createMdxLoaderPlugin } = await import('@ecopages/mdx/mdx-loader-plugin');
		const mdxPlugin = createMdxLoaderPlugin(
			ReactRenderer.mdxCompilerOptions ?? {
				jsxImportSource: 'react',
				jsxRuntime: 'automatic',
				development: process?.env?.NODE_ENV === 'development',
			},
		);

		const outdir = path.join(this.appConfig.absolutePaths.distDir, '.server-modules-react-mdx');
		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const fileHash = fileSystem.hash(filePath);
		const cacheBuster = process?.env?.NODE_ENV === 'development' ? `-${Date.now()}` : '';
		const outputFileName = `${fileBaseName}-${fileHash}${cacheBuster}.js`;

		const buildResult = await defaultBuildAdapter.build({
			entrypoints: [filePath],
			root: this.appConfig.rootDir,
			outdir,
			target: 'node',
			format: 'esm',
			sourcemap: 'none',
			splitting: false,
			minify: false,
			treeshaking: false,
			naming: outputFileName,
			plugins: [mdxPlugin],
		});

		if (!buildResult.success) {
			const details = buildResult.logs.map((log) => log.message).join(' | ');
			throw new Error(`Failed to compile MDX page module: ${details}`);
		}

		const preferredOutputPath = path.join(outdir, outputFileName);
		const compiledOutput =
			buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
			buildResult.outputs.find((output) => output.path.endsWith('.js'))?.path;

		if (!compiledOutput) {
			throw new Error(`No compiled MDX output generated for page: ${filePath}`);
		}

		return await import(pathToFileURL(compiledOutput).href);
	}

	async render({
		params,
		query,
		props,
		locals,
		pageLocals,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
		pageProps,
	}: IntegrationRendererRenderOptions<ReactNode>): Promise<RouteRendererBody> {
		try {
			const pageElement = createElement(Page, { params, query, ...props, locals: pageLocals });
			const contentElement = Layout
				? createElement(Layout as React.FunctionComponent, { locals } as object, pageElement)
				: pageElement;

			const safeLocals = this.getSerializableLocals(locals as RequestLocals);
			const allPageProps: HtmlTemplateProps['pageProps'] = {
				...pageProps,
				params,
				query,
				...(safeLocals && { locals: safeLocals }),
			};

			return await renderToReadableStream(
				createElement(
					HtmlTemplate,
					{
						metadata,
						pageProps: allPageProps,
					} as HtmlTemplateProps,
					contentElement,
				),
			);
		} catch (error) {
			throw this.createRenderError('Failed to render component', error);
		}
	}

	/**
	 * Safely extracts locals for client-side hydration.
	 *
	 * On dynamic pages with `cache: 'dynamic'`, middleware populates `locals` with
	 * request-scoped data (e.g., session). This data needs to be serialized to the
	 * client for hydration to match the server-rendered output.
	 *
	 * On static pages, `locals` is a Proxy that throws `LocalsAccessError` on access
	 * to prevent accidental use. This method safely detects that case and returns
	 * `undefined` instead of throwing.
	 *
	 * @param locals - The locals object from the render context
	 * @returns The locals object if serializable, undefined otherwise
	 */
	private getSerializableLocals(locals: RequestLocals): RequestLocals | undefined {
		try {
			if (locals && Object.keys(locals).length > 0) {
				return locals;
			}
			return undefined;
		} catch (e) {
			if (e instanceof LocalsAccessError) {
				return undefined;
			}
			throw e;
		}
	}

	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const viewConfig = view.config;
			const Layout = viewConfig?.layout as React.FunctionComponent | undefined;

			const ViewComponent = view as unknown as React.FunctionComponent;
			const pageElement = createElement(ViewComponent, props || {});

			if (ctx.partial) {
				const stream = await renderToReadableStream(pageElement);
				return this.createHtmlResponse(stream, ctx);
			}

			const contentElement = Layout
				? createElement(Layout as React.FunctionComponent, {}, pageElement)
				: pageElement;

			const HtmlTemplate = await this.getHtmlTemplate();
			const metadata: PageMetadataProps = view.metadata
				? await view.metadata({
						params: {},
						query: {},
						props,
						appConfig: this.appConfig,
					})
				: this.appConfig.defaultMetadata;

			await this.prepareViewDependencies(view, Layout as unknown as EcoComponent | undefined);

			const viewFilePath = viewConfig?.__eco?.file;
			if (viewFilePath) {
				const hydrationAssets = await this.buildRouteRenderAssets(viewFilePath);
				this.htmlTransformer.setProcessedDependencies([
					...this.htmlTransformer.getProcessedDependencies(),
					...hydrationAssets,
				]);
			}

			const streamBody = await renderToReadableStream(
				createElement(
					HtmlTemplate,
					{
						metadata,
						pageProps: props,
					} as HtmlTemplateProps,
					contentElement,
				),
			);

			const transformedResponse = await this.htmlTransformer.transform(
				new Response(streamBody, {
					headers: { 'Content-Type': 'text/html' },
				}),
			);

			return this.createHtmlResponse(transformedResponse.body as BodyInit, ctx);
		} catch (error) {
			throw this.createRenderError('Failed to render view', error);
		}
	}
}
