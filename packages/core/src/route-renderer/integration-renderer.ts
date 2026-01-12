/**
 * This module contains the abstract class for the Integration Renderer
 * Every integration renderer should extend this class
 * @module
 */

import path from 'node:path';
import type { EcoPagesAppConfig, IHmrManager } from '../internal-types.ts';
import type {
	EcoComponent,
	EcoComponentDependencies,
	EcoFunctionComponent,
	EcoPageFile,
	EcoPagesElement,
	GetMetadata,
	GetMetadataContext,
	GetStaticProps,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	PageMetadataProps,
	RouteRendererBody,
	RouteRendererOptions,
	StaticPageContext,
} from '../public-types.ts';
import {
	type AssetDefinition,
	AssetFactory,
	type AssetProcessingService,
	type ProcessedAsset,
} from '../services/asset-processing-service/index.ts';
import { HtmlTransformerService } from '../services/html-transformer.service.ts';
import { invariant } from '../utils/invariant.ts';

/**
 * The IntegrationRenderer class is an abstract class that provides a base for rendering integration-specific components in the EcoPages framework.
 * It handles the import of page files, collection of dependencies, and preparation of render options.
 * The class is designed to be extended by specific integration renderers.
 */
export abstract class IntegrationRenderer<C = EcoPagesElement> {
	abstract name: string;
	protected appConfig: EcoPagesAppConfig;
	protected assetProcessingService: AssetProcessingService;
	protected htmlTransformer: HtmlTransformerService;
	protected hmrManager?: IHmrManager;
	protected resolvedIntegrationDependencies: ProcessedAsset[] = [];
	declare protected options: Required<IntegrationRendererRenderOptions>;
	protected runtimeOrigin: string;

	protected DOC_TYPE = '<!DOCTYPE html>';

	public setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;
		if (this.assetProcessingService) {
			this.assetProcessingService.setHmrManager(hmrManager);
		}
	}

	constructor({
		appConfig,
		assetProcessingService,
		resolvedIntegrationDependencies,
		runtimeOrigin,
	}: {
		appConfig: EcoPagesAppConfig;
		assetProcessingService: AssetProcessingService;
		resolvedIntegrationDependencies?: ProcessedAsset[];
		runtimeOrigin: string;
	}) {
		this.appConfig = appConfig;
		this.assetProcessingService = assetProcessingService;
		this.htmlTransformer = new HtmlTransformerService();
		this.resolvedIntegrationDependencies = resolvedIntegrationDependencies || [];
		this.runtimeOrigin = runtimeOrigin;
	}

	/**
	 * Returns the HTML path from the provided file path.
	 * It extracts the path relative to the pages directory and removes the 'index' part if present.
	 *
	 * @param file - The file path to extract the HTML path from.
	 * @returns The extracted HTML path.
	 */
	protected getHtmlPath({ file }: { file: string }): string {
		const pagesDir = this.appConfig.absolutePaths.pagesDir;
		const pagesIndex = file.indexOf(pagesDir);
		if (pagesIndex === -1) return file;
		const startIndex = file.indexOf(pagesDir) + pagesDir.length;
		const endIndex = file.lastIndexOf('/');
		const path = file.substring(startIndex, endIndex);
		if (path === '/index') return '';
		return path;
	}

	/**
	 * Returns the HTML template component.
	 * It imports the HTML template from the specified path in the app configuration.
	 *
	 * @returns The HTML template component.
	 */
	protected async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		const { absolutePaths } = this.appConfig;
		try {
			const { default: HtmlTemplate } = await import(absolutePaths.htmlTemplatePath);
			return HtmlTemplate;
		} catch (error) {
			invariant(false, `Error importing HtmlTemplate: ${error}`);
		}
	}

	/**
	 * Returns the static props for the page.
	 * It calls the provided getStaticProps function with the given options.
	 *
	 * @param getStaticProps - The function to get static props.
	 * @param options - The options to pass to the getStaticProps function.
	 * @returns The static props and metadata.
	 */
	protected async getStaticProps(
		getStaticProps?: GetStaticProps<Record<string, unknown>>,
		options?: Pick<RouteRendererOptions, 'params'>,
	): Promise<{
		props: Record<string, unknown>;
		metadata?: PageMetadataProps;
	}> {
		return getStaticProps && options?.params
			? await getStaticProps({
					pathname: { params: options.params },
					appConfig: this.appConfig,
					runtimeOrigin: this.runtimeOrigin,
				})
					.then((data) => data)
					.catch((err) => {
						throw new Error(`Error fetching static props: ${err.message}`);
					})
			: {
					props: {},
					metadata: undefined,
				};
	}

	/**
	 * Returns the metadata properties for the page.
	 * It calls the provided getMetadata function with the given context.
	 *
	 * @param getMetadata - The function to get metadata.
	 * @param context - The context to pass to the getMetadata function.
	 * @returns The metadata properties.
	 */
	protected async getMetadataProps(
		getMetadata: GetMetadata | undefined,
		{ props, params, query }: GetMetadataContext,
	): Promise<PageMetadataProps> {
		let metadata: PageMetadataProps = this.appConfig.defaultMetadata;
		if (getMetadata) {
			const dynamicMetadata = await getMetadata({
				params,
				query,
				props,
				appConfig: this.appConfig,
			});
			metadata = { ...metadata, ...dynamicMetadata };
		}
		return metadata;
	}

	/**
	 * Imports the page file from the specified path.
	 * It uses dynamic import to load the file and returns the imported module.
	 *
	 * @param file - The file path to import.
	 * @returns The imported module.
	 */
	protected async importPageFile(file: string): Promise<EcoPageFile> {
		try {
			const query = process.env.NODE_ENV === 'development' ? `?update=${Date.now()}` : '';
			return await import(file + query);
		} catch (error) {
			invariant(false, `Error importing page file: ${error}`);
		}
	}

	/**
	 * Resolves the dependency path based on the component directory.
	 * It combines the component directory with the provided path URL.
	 *
	 * @param componentDir - The component directory path.
	 * @param pathUrl - The path URL to resolve.
	 * @returns The resolved dependency path.
	 */
	protected resolveDependencyPath(componentDir: string, pathUrl: string): string {
		return path.join(componentDir, pathUrl);
	}

	/**
	 * Extracts the dependencies from the provided component configuration.
	 * It resolves the paths for scripts and stylesheets based on the component directory.
	 *
	 * @param componentDir - The component directory path.
	 * @param scripts - The scripts to extract.
	 * @param stylesheets - The stylesheets to extract.
	 * @returns The extracted dependencies.
	 */
	protected extractDependencies({
		componentDir,
		scripts,
		stylesheets,
	}: {
		componentDir: string;
	} & EcoComponentDependencies): EcoComponentDependencies {
		const scriptsPaths = [...new Set(scripts?.map((script) => this.resolveDependencyPath(componentDir, script)))];

		const stylesheetsPaths = [
			...new Set(stylesheets?.map((style) => this.resolveDependencyPath(componentDir, style))),
		];

		return {
			scripts: scriptsPaths,
			stylesheets: stylesheetsPaths,
		};
	}

	/**
	 * Resolves lazy script paths to public asset URLs.
	 * Converts source paths to their final bundled output paths.
	 *
	 * @param componentDir - The component directory path.
	 * @param scripts - The lazy script paths to resolve.
	 * @returns Comma-separated string of resolved public script paths.
	 */
	protected resolveLazyScripts(componentDir: string, scripts: string[]): string {
		const getSafeFileName = (filepath: string): string => {
			const EXTENSIONS_TO_JS = ['ts', 'tsx'];
			const safe = filepath.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
			return safe.startsWith('./') ? safe.slice(2) : safe;
		};

		const baseDir = componentDir.split(this.appConfig.srcDir)[1] ?? '';
		const resolvedPaths = scripts.map((script) => {
			return [AssetFactory.RESOLVED_ASSETS_DIR, baseDir, getSafeFileName(script)]
				.filter(Boolean)
				.join('/')
				.replace(/\/+/g, '/');
		});

		return resolvedPaths.join(',');
	}

	/**
	 * Collects the dependencies for the provided components.
	 * Combines component-specific dependencies with global integration dependencies.
	 *
	 * @param components - The components to collect dependencies from.
	 */
	protected async resolveDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		const componentDeps = await this.processComponentDependencies(components);
		return this.resolvedIntegrationDependencies.concat(componentDeps);
	}

	/**
	 * Processes component-specific dependencies WITHOUT prepending global integration dependencies.
	 * Use this method when you need only the component's own assets.
	 *
	 * @param components - The components to collect dependencies from.
	 */
	protected async processComponentDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		if (!this.assetProcessingService) return [];
		const dependencies: AssetDefinition[] = [];

		for (const component of components) {
			const componentDir = component.config?.componentDir;
			if (!componentDir) continue;

			const stylesheetsSet = new Set<string>();
			const scriptsSet = new Set<string>();

			const collect = (config: EcoComponent['config']) => {
				if (!config?.dependencies) return;

				const dir = config.componentDir;
				if (!dir) return;

				if (config.dependencies.stylesheets) {
					for (const style of config.dependencies.stylesheets) {
						stylesheetsSet.add(this.resolveDependencyPath(dir, style));
					}
				}

				if (config.dependencies.scripts) {
					for (const script of config.dependencies.scripts) {
						scriptsSet.add(this.resolveDependencyPath(dir, script));
					}
				}

				/**
				 * Process lazy dependencies - resolve paths and store for auto-wrapping
				 * It adds lazy scripts with exclude flag so they don't appear in main HTML
				 */
				if (config.dependencies.lazy?.scripts) {
					const lazyScriptPaths = this.resolveLazyScripts(dir, config.dependencies.lazy.scripts);
					config._resolvedScripts = lazyScriptPaths;

					for (const script of config.dependencies.lazy.scripts) {
						scriptsSet.add(this.resolveDependencyPath(dir, script) + '?exclude-from-html=true');
					}
				}

				if (config.dependencies.components) {
					for (const component of config.dependencies.components) {
						if (component.config) {
							collect(component.config);
						}
					}
				}
			};

			collect(component.config);

			const deps = {
				stylesheets: Array.from(stylesheetsSet),
				scripts: Array.from(scriptsSet),
			};

			dependencies.push(
				...deps.stylesheets.map((stylesheet) =>
					AssetFactory.createFileStylesheet({
						filepath: stylesheet,
						position: 'head',
						attributes: { rel: 'stylesheet' },
					}),
				),
				...deps.scripts.map((script) =>
					AssetFactory.createFileScript({
						filepath: script,
						position: 'head',
						attributes: {
							type: 'module',
							defer: '',
						},
					}),
				),
			);
		}

		return await this.assetProcessingService.processDependencies(dependencies, this.name);
	}

	/**
	 * Prepares the render options for the integration renderer.
	 * It imports the page file, collects dependencies, and prepares the render options.
	 *
	 * @param options - The route renderer options.
	 * @returns The prepared render options.
	 */
	protected async prepareRenderOptions(options: RouteRendererOptions): Promise<IntegrationRendererRenderOptions> {
		const {
			default: Page,
			getStaticProps,
			getMetadata,
			...integrationSpecificProps
		} = await this.importPageFile(options.file);

		const HtmlTemplate = await this.getHtmlTemplate();

		const { props } = await this.getStaticProps(getStaticProps, options);

		const metadata = await this.getMetadataProps(getMetadata, {
			props,
			params: options.params ?? {},
			query: options.query ?? {},
		} as GetMetadataContext);

		const Layout = Page.config?.layout;

		const componentsToResolve = Layout ? [HtmlTemplate, Layout, Page] : [HtmlTemplate, Page];
		const resolvedDependencies = await this.resolveDependencies(componentsToResolve);

		const pageDeps = (await this.buildRouteRenderAssets(options.file)) || [];

		const allDependencies = [...resolvedDependencies, ...pageDeps];

		this.htmlTransformer.setProcessedDependencies(allDependencies);

		const pageProps = {
			...props,
			params: options.params || {},
			query: options.query || {},
		};

		return {
			...options,
			...integrationSpecificProps,
			resolvedDependencies,
			HtmlTemplate,
			Layout,
			props,
			Page: Page as EcoFunctionComponent<StaticPageContext, EcoPagesElement>,
			metadata,
			params: options.params || {},
			query: options.query || {},
			pageProps,
		};
	}

	/**
	 * Executes the integration renderer with the provided options.
	 *
	 * @param options - The route renderer options.
	 * @returns The rendered body.
	 */
	public async execute(options: RouteRendererOptions): Promise<RouteRendererBody> {
		const renderOptions = await this.prepareRenderOptions(options);

		return await this.htmlTransformer
			.transform(
				new Response((await this.render(renderOptions as IntegrationRendererRenderOptions<C>)) as BodyInit, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
			)
			.then((res: Response) => {
				return res.body as RouteRendererBody;
			});
	}

	/**
	 * Abstract method to render the integration-specific component.
	 * This method should be implemented by the specific integration renderer.
	 *
	 * @param options - The integration renderer render options.
	 * @returns The rendered body.
	 */
	abstract render(options: IntegrationRendererRenderOptions<C>): Promise<RouteRendererBody>;

	/**
	 * Method to build route render assets.
	 * This method can be optionally overridden by the specific integration renderer.
	 *
	 * @param file - The file path to build assets for.
	 * @returns The processed assets or undefined.
	 */
	protected buildRouteRenderAssets(_file: string): Promise<ProcessedAsset[]> | undefined {
		return undefined;
	}
}
