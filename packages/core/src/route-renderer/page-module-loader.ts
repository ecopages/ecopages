import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultBuildAdapter } from '../build/build-adapter.ts';
import { fileSystem } from '@ecopages/file-system';
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
import type { EcoPagesAppConfig } from '../internal-types.ts';

/**
 * Handles page module loading plus static props/metadata resolution.
 */
export class PageModuleLoaderService {
	constructor(
		private appConfig: EcoPagesAppConfig,
		private runtimeOrigin: string,
	) {}

	/**
	 * Imports a page module from source.
	 * Uses direct dynamic import in Bun and transpile+import fallback for other runtimes.
	 */
	async importPageFile(file: string): Promise<EcoPageFile> {
		if (typeof Bun !== 'undefined') {
			try {
				const query = process.env.NODE_ENV === 'development' ? `?update=${Date.now()}` : '';
				return await import(file + query);
			} catch (error) {
				invariant(false, `Error importing page file: ${error}`);
			}
		}

		try {
			const outdir = path.join(this.appConfig.absolutePaths.distDir, '.server-modules');
			const fileBaseName = path.basename(file, path.extname(file));
			const fileHash = fileSystem.hash(file);
			const cacheBuster = process.env.NODE_ENV === 'development' ? `-${Date.now()}` : '';
			const outputFileName = `${fileBaseName}-${fileHash}${cacheBuster}.js`;

			const buildResult = await defaultBuildAdapter.build({
				entrypoints: [file],
				root: this.appConfig.rootDir,
				outdir,
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				naming: outputFileName,
			});

			if (!buildResult.success) {
				const details = buildResult.logs.map((log) => log.message).join(' | ');
				invariant(false, `Error transpiling page file: ${details}`);
			}

			const preferredOutputPath = path.join(outdir, outputFileName);
			const compiledOutput =
				buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
				buildResult.outputs.find((output) => output.path.endsWith('.js'))?.path;

			invariant(!!compiledOutput, `No transpiled output generated for page: ${file}`);

			return await import(pathToFileURL(compiledOutput).href);
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
