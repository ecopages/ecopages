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
	private resolvedIntegrationDependencies: ProcessedAsset[] = [];
	declare protected options: Required<IntegrationRendererRenderOptions>;
	protected runtimeOrigin: string;

	protected DOC_TYPE = '<!DOCTYPE html>';

	public setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;

		/** Also set it on the asset processing service if available */
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

		// @ts-expect-error - This issues appeared from one moment to another after a bun update, need to investigate
		if (typeof HTMLElement === 'undefined') global.HTMLElement = class {};
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
	 * Resolves the dependency path based on the import meta information.
	 * It combines the directory of the import meta with the provided path URL.
	 *
	 * @param importMeta - The import meta information.
	 * @param pathUrl - The path URL to resolve.
	 * @returns The resolved dependency path.
	 */
	protected resolveDependencyPath(importMeta: ImportMeta, pathUrl: string): string {
		return path.join(importMeta.dir, pathUrl);
	}

	/**
	 * Extracts the dependencies from the provided component configuration.
	 * It resolves the paths for scripts and stylesheets based on the import meta information.
	 *
	 * @param importMeta - The import meta information.
	 * @param scripts - The scripts to extract.
	 * @param stylesheets - The stylesheets to extract.
	 * @returns The extracted dependencies.
	 */
	protected extractDependencies({
		importMeta,
		scripts,
		stylesheets,
	}: {
		importMeta: ImportMeta;
	} & EcoComponentDependencies): EcoComponentDependencies {
		const scriptsPaths = [...new Set(scripts?.map((script) => this.resolveDependencyPath(importMeta, script)))];

		const stylesheetsPaths = [
			...new Set(stylesheets?.map((style) => this.resolveDependencyPath(importMeta, style))),
		];

		return {
			scripts: scriptsPaths,
			stylesheets: stylesheetsPaths,
		};
	}

	/**
	 * Collects the dependencies for the provided components.
	 * It registers the dependencies with the assets dependency service.
	 *
	 * @param components - The components to collect dependencies from.
	 */
	protected async resolveDependencies(
		components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		if (!this.assetProcessingService) return [];
		const dependencies: AssetDefinition[] = [];

		for (const component of components) {
			if (!component.config?.importMeta) continue;

			const stylesheetsSet = new Set<string>();
			const scriptsSet = new Set<string>();

			const collect = (config: EcoComponent['config']) => {
				if (!config?.dependencies) return;

				const collectedDependencies = this.extractDependencies({
					...config.dependencies,
					importMeta: config.importMeta,
				});

				for (const stylesheet of collectedDependencies.stylesheets || []) {
					stylesheetsSet.add(stylesheet);
				}

				for (const script of collectedDependencies.scripts || []) {
					scriptsSet.add(script);
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

		const routeAssetsDependencies = await this.assetProcessingService.processDependencies(dependencies, this.name);
		return this.resolvedIntegrationDependencies.concat(routeAssetsDependencies);
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

		const resolvedDependencies = await this.resolveDependencies([HtmlTemplate, Page]);

		const pageDeps = (await this.buildRouteRenderAssets(options.file)) || [];

		const allDependencies = [...resolvedDependencies, ...pageDeps];

		this.htmlTransformer.setProcessedDependencies(allDependencies);

		return {
			...options,
			...integrationSpecificProps,
			resolvedDependencies,
			HtmlTemplate,
			props,
			Page: Page as EcoFunctionComponent<StaticPageContext, EcoPagesElement>,
			metadata,
			params: options.params || {},
			query: options.query || {},
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
