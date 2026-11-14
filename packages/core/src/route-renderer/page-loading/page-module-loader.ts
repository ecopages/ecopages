import { invariant } from '../../utils/invariant.ts';
import type {
	EcoPageFile,
	GetMetadata,
	GetMetadataContext,
	GetProps,
	PageMetadataProps,
	RouteRendererOptions,
	EcoPageComponent,
} from '../../types/contracts.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { DATA_HOOKS_MIGRATION_URL } from '../../eco/migration-docs.ts';
import { HttpError } from '../../errors/http-error.ts';

const LEGACY_PAGE_EXPORT_NAMES = ['getStaticPaths', 'getStaticProps', 'getMetadata'] as const;

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
	private appConfig: EcoPagesAppConfig;

	/**
	 * Creates the page-module loader for one app/runtime instance.
	 *
	 * @param appConfig Finalized app config that owns build and invalidation state.
	 */
	constructor(appConfig: EcoPagesAppConfig) {
		this.appConfig = appConfig;
	}

	/**
	 * Imports one page module through the shared server-side module loading path.
	 *
	 * @remarks
	 * The app-owned module loader keeps every request on the same build and cache path.
	 */
	async importPageFile(file: string, options?: { bypassCache?: boolean }): Promise<EcoPageFile> {
		try {
			return await requireAppRuntime(this.appConfig).moduleLoader.importModule<EcoPageFile>({
				filePath: file,
				outdir: `${resolveInternalExecutionDir(this.appConfig)}/.server-modules`,
				bypassCache: options?.bypassCache,
				transpileErrorMessage: (details) => `Error transpiling page file: ${details}`,
				noOutputMessage: (targetFilePath) => `No transpiled output generated for page: ${targetFilePath}`,
			});
		} catch (error) {
			invariant(false, `Error importing page file: ${error}`, { cause: error });
		}
	}

	/**
	 * Executes the page's `props` hook with Ecopages runtime context.
	 *
	 * @remarks
	 * Pages without a `props` hook still return a normalized empty props
	 * object so downstream render preparation does not branch on hook presence.
	 */
	async getPropsForPage(options: {
		getProps?: GetProps<Record<string, unknown>>;
		params?: RouteRendererOptions['params'];
	}): Promise<{
		props: Record<string, unknown>;
		metadata?: PageMetadataProps;
	}> {
		const { getProps, params } = options;
		if (!getProps) {
			return { props: {}, metadata: undefined };
		}
		try {
			const props = await getProps({
				pathname: { params: params ?? {} },
				appConfig: this.appConfig,
				runtimeOrigin: requireAppRuntime(this.appConfig).origin,
			});
			return { props };
		} catch (err) {
			if (HttpError.isHttpError(err) || err instanceof Response) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Error fetching props: ${message}`, { cause: err });
		}
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
	 * Fails when a page module still declares data through the removed module-level exports.
	 *
	 * @remarks
	 * Integrations that cannot call `eco.page(...)`, such as MDX, move their metadata export onto the
	 * Page in `normalizePageModule`, so only modules that declare the old exports reach this check.
	 */
	assertNoLegacyPageExports(file: string, module: EcoPageFile): void {
		const found = LEGACY_PAGE_EXPORT_NAMES.filter(
			(name) => (module as Record<string, unknown>)[name] !== undefined,
		);
		if (found.length === 0) return;
		throw new Error(
			`[ecopages] ${file} exports ${found.join(', ')}. Pages declare data through the paths, props and metadata options of eco.page({ ... }); module-level exports are no longer read. Migration steps: ${DATA_HOOKS_MIGRATION_URL}`,
		);
	}

	/**
	 * Loads a page module and resolves the data hooks of its Page component.
	 *
	 * @remarks
	 * Throws through {@link PageModuleLoaderService.assertNoLegacyPageExports} when the module still
	 * has a legacy data export.
	 */
	async resolvePageModule(options: {
		file: string;
		pageModule?: EcoPageFile;
		importPageFileFn?: (file: string) => Promise<EcoPageFile>;
	}): Promise<{
		module: EcoPageFile;
		Page: EcoPageFile['default'] | EcoPageComponent<any>;
		getProps?: GetProps<Record<string, unknown>>;
		getMetadata?: GetMetadata;
		integrationSpecificProps: Record<string, unknown>;
	}> {
		const module =
			options.pageModule ??
			(await (options.importPageFileFn ?? ((file) => this.importPageFile(file)))(options.file));
		this.assertNoLegacyPageExports(options.file, module);
		const { default: Page, ...integrationSpecificProps } = module;
		const pageComponent = Page as EcoPageComponent<any>;

		return {
			module,
			Page,
			getProps: pageComponent.props,
			getMetadata: pageComponent.metadata,
			integrationSpecificProps,
		};
	}

	/**
	 * Resolves the page data needed by the render pipeline.
	 *
	 * @remarks
	 * The `props` hook runs first because page metadata may depend on its result.
	 * Props passed with the render win over the hook's props and are visible to
	 * metadata; `skipPropsHook` drops the hook.
	 */
	async resolvePageData(options: {
		pageModule: {
			getProps?: GetProps<Record<string, unknown>>;
			getMetadata?: GetMetadata;
		};
		routeOptions: RouteRendererOptions;
		skipMetadata?: boolean;
	}): Promise<{
		props: Record<string, unknown>;
		metadata: PageMetadataProps;
	}> {
		const hookProps = options.routeOptions.skipPropsHook
			? {}
			: (
					await this.getPropsForPage({
						getProps: options.pageModule.getProps,
						params: options.routeOptions.params,
					})
				).props;
		const props = { ...hookProps, ...(options.routeOptions.props ?? {}) };

		const metadata = options.skipMetadata
			? this.appConfig.defaultMetadata
			: await this.getMetadataPropsForPage({
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
