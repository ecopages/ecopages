import type { MdxCompilerOptionsInput } from '@ecopages/mdx/core';
import type { IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import type {
	AssetDefinition,
	AssetProcessingService,
	ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type { EcopagesJsxRadiantSsrPolicy } from './ecopages-jsx-radiant-ssr-policy.ts';

/**
 * MDX configuration for the JSX integration.
 *
 * Mirrors Ecopages' built-in combined integration pattern where a single
 * JSX-capable plugin can own both `.tsx` and `.mdx` route files.
 */
export type EcopagesJsxMdxOptions = MdxCompilerOptionsInput;

/** Options for the JSX integration plugin. */
export type EcopagesJsxPluginOptions = Omit<IntegrationPluginConfig, 'name' | 'extensions'> & {
	/** Optional JSX route extensions. Defaults to `.tsx`. */
	extensions?: string[];
	/**
	 * Whether to enable the Radiant SSR contract for JSX apps.
	 *
	 * When enabled, Ecopages JSX installs the Radiant server SSR runtime so
	 * intrinsic custom elements can render specialized host markup during SSR.
	 *
	 * Set to `false` when pages do not use Radiant web components.
	 * @default true
	 */
	radiant?: boolean;
	/** Optional MDX integration configuration. */
	mdx?: EcopagesJsxMdxOptions;
};

export type EcopagesJsxRendererConfig = {
	mdxExtensions?: string[];
	radiantSsrPolicy?: EcopagesJsxRadiantSsrPolicy;
	radiantSsrEnabled?: boolean;
};

export type EcopagesJsxRendererOptions = {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	runtimeOrigin: string;
	jsxConfig?: EcopagesJsxRendererConfig;
};

export type { AssetDefinition };
