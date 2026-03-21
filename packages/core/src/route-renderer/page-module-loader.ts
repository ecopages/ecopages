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
 * Loads route page modules and normalizes their data hooks for rendering.
 *
 * @remarks
 * This service keeps the render pipeline from depending directly on raw module
 * imports. It owns the shared server-module transpiler setup, the precedence
 * rules between component statics and module exports, and the normalization of
 * page props and metadata into one renderer-facing shape.
 */
export class PageModuleLoaderService {
	private serverModuleTranspiler: ServerModuleTranspiler;
	private appConfig: EcoPagesAppConfig;
	private runtimeOrigin: string;

	/**
	 * Creates the page-module loader for one app/runtime instance.
	 *
	 * @param appConfig Finalized app config that owns build and invalidation state.
	 * @param runtimeOrigin Runtime origin exposed to page data hooks.
	 */
	constructor(appConfig: EcoPagesAppConfig, runtimeOrigin: string) {
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
	 * Imports one page module through the shared server-side module loading path.
	 *
	 * @remarks
	 * The underlying transpiler keeps Bun and Node aligned on one framework-owned
	 * loading contract even though the runtime-specific execution transport differs.
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
	 * Executes the page's static-props hook with Ecopages runtime context.
	 *
	 * @remarks
	 * Pages without a static-props hook still return a normalized empty props
	 * object so downstream render preparation does not branch on hook presence.
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
	 * Builds the final page metadata object for one render request.
	 *
	 * @remarks
	 * App-level default metadata forms the baseline, then page-level metadata is
	 * overlaid so route-specific fields win without dropping global defaults.
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
	 * Resolves the page data needed by the render pipeline.
	 *
	 * @remarks
	 * Static props are resolved first because page metadata may depend on those
	 * props. This preserves the same ordering whether data hooks are declared as
	 * component statics or module exports.
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
