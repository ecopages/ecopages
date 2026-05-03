import type { CompileOptions } from '@mdx-js/mdx';
import type { IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';

type MdxPluginList = NonNullable<CompileOptions['remarkPlugins']>;

export type EcopagesJsxMdxCompileOptions = Omit<
	CompileOptions,
	'jsxImportSource' | 'jsxRuntime' | 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'
> & {
	remarkPlugins?: MdxPluginList;
	rehypePlugins?: MdxPluginList;
	recmaPlugins?: MdxPluginList;
};

/**
 * MDX configuration for the JSX integration.
 *
 * Mirrors Ecopages' built-in combined integration pattern where a single
 * JSX-capable plugin can own both `.tsx` and `.mdx` route files.
 */
export type EcopagesJsxMdxOptions = {
	/** Enables MDX file handling inside the JSX integration. */
	enabled: boolean;
	/** Additional MDX compiler options. JSX runtime fields are managed by the integration. */
	compilerOptions?: EcopagesJsxMdxCompileOptions;
	/** Extra remark plugins appended to `compilerOptions.remarkPlugins`. */
	remarkPlugins?: MdxPluginList;
	/** Extra rehype plugins appended to `compilerOptions.rehypePlugins`. */
	rehypePlugins?: MdxPluginList;
	/** Extra recma plugins appended to `compilerOptions.recmaPlugins`. */
	recmaPlugins?: MdxPluginList;
	/** Custom file extensions to treat as MDX. */
	extensions?: string[];
};

/** Options for the JSX integration plugin. */
export type EcopagesJsxPluginOptions = Omit<IntegrationPluginConfig, 'name' | 'extensions'> & {
	/** Optional JSX route extensions. Defaults to `.tsx`. */
	extensions?: string[];
	/**
	 * Whether to include the Radiant integration contract for JSX apps.
	 *
	 * When enabled, Ecopages JSX:
	 * - imports `@ecopages/radiant/server/render-component` before Radiant SSR
	 * - exposes browser-safe Radiant bare specifiers through the runtime import map
	 * - injects an explicit client bootstrap that imports
	 *   `@ecopages/radiant/client/install-hydrator` before intrinsic
	 *   custom-element modules load
	 *
	 * Set to `false` when pages do not use Radiant web components.
	 * @default true
	 */
	radiant?: boolean;
	/** Optional MDX integration configuration. */
	mdx?: EcopagesJsxMdxOptions;
};

export type EcopagesJsxRendererConfig = {
	intrinsicCustomElementAssets?: Map<string, readonly ProcessedAsset[]>;
	mdxExtensions?: string[];
	radiantSsrEnabled?: boolean;
};

export type EcopagesJsxRendererOptions = {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	rendererModules?: unknown;
	runtimeOrigin: string;
	jsxConfig?: EcopagesJsxRendererConfig;
};

export type { AssetDefinition };
