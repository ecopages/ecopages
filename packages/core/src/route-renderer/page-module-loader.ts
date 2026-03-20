import { invariant } from '../utils/invariant.ts';
import type {
	EcoPageFile,
	GetMetadata,
	GetMetadataContext,
	GetStaticProps,
	PageMetadataProps,
	RouteRendererOptions,
	EcoPageComponent,
} from '../public-types.ts';
import { getAppBuildExecutor } from '../build/build-adapter.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { DevelopmentInvalidationService } from '../services/development-invalidation.service.ts';
import { ServerModuleTranspiler } from '../services/server-module-transpiler.service.ts';

/**
 * Handles page module loading plus static props/metadata resolution.
 */
export class PageModuleLoaderService {
	private serverModuleTranspiler: ServerModuleTranspiler;
	private appConfig: EcoPagesAppConfig;
	private runtimeOrigin: string;

	constructor(
		appConfig: EcoPagesAppConfig,
		runtimeOrigin: string,
	) {
		this.appConfig = appConfig;
		this.runtimeOrigin = runtimeOrigin;
		const invalidationService = new DevelopmentInvalidationService(appConfig);
		this.serverModuleTranspiler = new ServerModuleTranspiler({
			rootDir: appConfig.rootDir,
			buildExecutor: getAppBuildExecutor(appConfig),
			getInvalidationVersion: () => invalidationService.getServerModuleInvalidationVersion(),
			invalidateModules: (changedFiles) => invalidationService.invalidateServerModules(changedFiles),
		});
	}

	/**
	 * Imports a page module from source.
	 * Uses direct dynamic import in Bun and transpile+import fallback for other runtimes.
	 */
	async importPageFile(file: string): Promise<EcoPageFile> {
		try {
			return await this.serverModuleTranspiler.importModule<EcoPageFile>({
				filePath: file,
				outdir: `${this.appConfig.absolutePaths.distDir}/.server-modules`,
				transpileErrorMessage: (details) => `Error transpiling page file: ${details}`,
				noOutputMessage: (targetFilePath) => `No transpiled output generated for page: ${targetFilePath}`,
			});
		} catch (error) {
			invariant(false, `Error importing page file: ${error}`);
		}
	}

	/**
	 * Executes `getStaticProps` with Ecopages runtime context.
	 * Returns an empty props object when no static props function is defined.
	 */
	async getStaticPropsForPage(options: {
		getStaticProps?: GetStaticProps<Record<string, unknown>>;
		params?: RouteRendererOptions['params'];
	}): Promise<{
		props: Record<string, unknown>;
		metadata?: PageMetadataProps;
	}> {
		const { getStaticProps, params } = options;
		return getStaticProps
			? await getStaticProps({
					pathname: { params: params ?? {} },
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
	 * Builds final page metadata using app-level defaults as a baseline.
	 * If `getMetadata` exists, its result overlays defaults so page-level fields take precedence.
	 */
	async getMetadataPropsForPage(options: {
		getMetadata: GetMetadata | undefined;
		context: GetMetadataContext;
	}): Promise<PageMetadataProps> {
		const { getMetadata, context } = options;
		let metadata: PageMetadataProps = this.appConfig.defaultMetadata;
		if (getMetadata) {
			const dynamicMetadata = await getMetadata({
				params: context.params,
				query: context.query,
				props: context.props,
				appConfig: this.appConfig,
			});
			metadata = { ...metadata, ...dynamicMetadata };
		}
		return metadata;
	}

	/**
	 * Loads a page module and normalizes integration-facing exports.
	 * When both component static methods and module exports exist, component statics win.
	 */
	async resolvePageModule(options: {
		file: string;
		importPageFileFn?: (file: string) => Promise<EcoPageFile>;
	}): Promise<{
		Page: EcoPageFile['default'] | EcoPageComponent<any>;
		getStaticProps?: GetStaticProps<Record<string, unknown>>;
		getMetadata?: GetMetadata;
		integrationSpecificProps: Record<string, unknown>;
	}> {
		const module = await (options.importPageFileFn ?? ((file) => this.importPageFile(file)))(options.file);
		const {
			default: Page,
			getStaticProps: moduleGetStaticProps,
			getMetadata: moduleGetMetadata,
			...integrationSpecificProps
		} = module;

		return {
			Page,
			getStaticProps: Page.staticProps ?? moduleGetStaticProps,
			getMetadata: Page.metadata ?? moduleGetMetadata,
			integrationSpecificProps,
		};
	}

	/**
	 * Resolves render-time page data in order: static props first, then metadata derived from those props.
	 */
	async resolvePageData(options: {
		pageModule: {
			getStaticProps?: GetStaticProps<Record<string, unknown>>;
			getMetadata?: GetMetadata;
		};
		routeOptions: RouteRendererOptions;
	}): Promise<{
		props: Record<string, unknown>;
		metadata: PageMetadataProps;
	}> {
		const { props } = await this.getStaticPropsForPage({
			getStaticProps: options.pageModule.getStaticProps,
			params: options.routeOptions.params,
		});

		const metadata = await this.getMetadataPropsForPage({
			getMetadata: options.pageModule.getMetadata,
			context: {
				props,
				params: options.routeOptions.params ?? {},
				query: options.routeOptions.query ?? {},
			} as GetMetadataContext,
		});

		return { props, metadata };
	}
}
