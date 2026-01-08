import type { Readable } from 'node:stream';
import type { BunPlugin } from 'bun';
import type { ApiResponseBuilder } from './adapters/shared/api-response.js';
import type { EcoPagesAppConfig } from './internal-types.ts';
import type { HmrStrategy } from './hmr/hmr-strategy.ts';
import type { ProcessedAsset } from './services/asset-processing-service/assets.types.ts';

/**
 * Context interface for HMR strategies.
 * Provides access to watched files, specifier mappings, and build configuration.
 */
export interface DefaultHmrContext {
	/**
	 * Map of registered entrypoints to their output URLs.
	 */
	getWatchedFiles(): Map<string, string>;

	/**
	 * Map of bare specifiers to vendor URLs for import resolution.
	 */
	getSpecifierMap(): Map<string, string>;

	/**
	 * Directory where HMR bundles are written.
	 */
	getDistDir(): string;

	/**
	 * Bun plugins to use during bundling.
	 */
	getPlugins(): BunPlugin[];

	/**
	 * Absolute path to the source directory.
	 */
	getSrcDir(): string;
}

/**
 * Represents an event broadcast to connected clients via the ClientBridge.
 */
export type ClientBridgeEvent = {
	/**
	 * Event type: 'reload' triggers full refresh, 'update' for JS modules, 'css-update' for stylesheets
	 */
	type: 'reload' | 'error' | 'update' | 'css-update';
	/**
	 * Path to the changed file
	 */
	path?: string;
	/**
	 * Optional message for error or debug info
	 */
	message?: string;
	/**
	 * Timestamp for cache busting
	 */
	timestamp?: number;
};

/**
 * Interface for the HMR Manager.
 * Used by integration plugins to register entrypoints and strategies.
 */
export interface IHmrManager {
	/**
	 * Registers a client entrypoint to be built and watched.
	 */
	registerEntrypoint(entrypointPath: string): Promise<string>;

	/**
	 * Registers mappings from bare specifiers to vendor URLs.
	 */
	registerSpecifierMap(map: Record<string, string>): void;

	/**
	 * Registers a custom HMR strategy.
	 */
	registerStrategy(strategy: HmrStrategy): void;

	/**
	 * Sets the Bun plugins to use during bundling.
	 */
	setPlugins(plugins: BunPlugin[]): void;

	/**
	 * Enables or disables HMR.
	 */
	setEnabled(enabled: boolean): void;

	/**
	 * Returns whether HMR is enabled.
	 */
	isEnabled(): boolean;

	/**
	 * Broadcasts an HMR event to connected clients.
	 */
	broadcast(event: ClientBridgeEvent): void;

	/**
	 * Gets the output URL for a registered entrypoint.
	 */
	getOutputUrl(entrypointPath: string): string | undefined;

	/**
	 * Gets the map of watched files.
	 */
	getWatchedFiles(): Map<string, string>;

	/**
	 * Gets the specifier map.
	 */
	getSpecifierMap(): Map<string, string>;

	/**
	 * Gets the HMR dist directory.
	 */
	getDistDir(): string;

	/**
	 * Gets the Bun plugins.
	 */
	getPlugins(): BunPlugin[];

	/**
	 * Gets the default HMR context.
	 */
	getDefaultContext(): DefaultHmrContext;

	/**
	 * Handles a file change event.
	 */
	handleFileChange(path: string): Promise<void>;
}

/**
 * Represents the dependencies for an EcoComponent.
 */
export type EcoComponentDependencies = {
	stylesheets?: string[];
	scripts?: string[];
	components?: EcoComponent[];
};

export type EcoPagesElement = string | Promise<string>;

/**
 * Represents the input configuration for EcoPages.
 */
export type EcoPagesConfig = Omit<
	Partial<EcoPagesAppConfig>,
	'baseUrl' | 'derivedPaths' | 'templatesExt' | 'integrationsDependencies'
> &
	Pick<EcoPagesAppConfig, 'baseUrl' | 'rootDir'>;

/**
 * Configuration object for an EcoComponent.
 */
export type EcoComponentConfig = {
	/**
	 * The directory path of the component file.
	 * This is auto-injected by the eco-component-dir-plugin at load time.
	 */
	componentDir?: string;
	dependencies?: EcoComponentDependencies;
};

/**
 * The base structure for any EcoPages component.
 */
export type EcoComponentBase = {
	/**
	 * The configuration options for the EcoComponent.
	 */
	config?: EcoComponentConfig;
};

/**
 * Checks if a type is `any`.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * A function component type that is framework-agnostic.
 * Uses a broader signature to support both direct calls and HOC wrappers.
 */
export type EcoFunctionComponent<P, R> = {
	(props: P, ...args: any[]): R;
} & EcoComponentBase;

/**
 * Represents an EcoComponent.
 *
 * It can be defined by passing the props type as the first generic,
 * or by passing the component type itself to infer the signature.
 *
 * @template T - The type of the props object or the component function itself.
 * @template C - The type of the rendered element.
 *
 * @example
 * //1. Simplest usage
 * export const MyComponent: EcoComponent<{prop1: string}> = ({prop1}) => {
 *   return <div>...</div>;
 * };
 *
 * @example
 * // 2. Using with HOCs like MobX observer (passing the props type)
 * export const MyObservedComponent: EcoComponent<object> = observer(function MyObservedComponent() {
 *   return <div>...</div>;
 * });
 *
 * @example
 * // 3. Passing the full function signature (Perfect for Generic Components)
 * export const Select: EcoComponent<<T extends object>(props: SelectProps<T>) => JSX.Element> = <T extends object>({
 *   label,
 *   items,
 * }: SelectProps<T>) => {
 *   return <select>...</select>;
 * };
 */
/**
 * A function component type that is framework-agnostic.
 * Uses a broader signature to support both direct calls and HOC wrappers.
 */
export type EcoComponent<P = any, R = any> =
	IsAny<P> extends true
		? EcoFunctionComponent<any, any> | EcoComponentBase
		: P extends (props: infer Props, ...args: any[]) => infer Return
			? EcoFunctionComponent<Props, Return>
			: EcoFunctionComponent<P, R>;

/**
 * Represents a page in EcoPages.
 */
export type PageProps<T = unknown> = T & StaticPageContext;

/**
 * Represents the metadata for a page.
 */
export interface PageMetadataProps {
	title: string;
	description: string;
	image?: string;
	url?: string;
	keywords?: string[];
}

/**
 * Represents the props for the head of a page.
 */
export interface PageHeadProps<T = EcoPagesElement> {
	metadata: PageMetadataProps;
	dependencies?: EcoComponentDependencies;
	children?: T;
}

/**
 * Represents the props for the HTML template of a page.
 */
export interface HtmlTemplateProps extends PageHeadProps {
	children: EcoPagesElement;
	language?: string;
	headContent?: EcoPagesElement;
	pageProps: Record<string, unknown>;
}

/**
 * Represents the props for the error 404 template.
 */
export interface Error404TemplateProps extends Omit<HtmlTemplateProps, 'children'> {
	message: string;
	stack?: string;
}

/**
 * Represents the parameters for a page.
 * The keys are strings, and the values can be either a string or an array of strings.
 */
export type PageParams = Record<string, string | string[]>;

/**
 * Represents a query object for a page.
 * The keys are strings and the values can be either a string or an array of strings.
 */
export type PageQuery = Record<string, string | string[]>;

/**
 * Represents the context object for a static page.
 */
export type StaticPageContext = {
	params?: PageParams;
	query?: PageQuery;
};

/**
 * Represents the params for a static path.
 */
export type StaticPath = { params: PageParams };

/**
 * The function that returns the static paths for a page.
 */
export type GetStaticPaths = (context: { appConfig: EcoPagesAppConfig; runtimeOrigin: string }) => Promise<{
	paths: StaticPath[];
}>;

/**
 * The context object for the getMetadata function.
 */
export type GetMetadataContext<T = Record<string, unknown>> = Required<StaticPageContext> & {
	props: T;
	appConfig: EcoPagesAppConfig;
};

/**
 * The function that returns the metadata for a page.
 */
export type GetMetadata<T = Record<string, unknown>> = (
	context: GetMetadataContext<T>,
) => PageMetadataProps | Promise<PageMetadataProps>;

/**
 * The function that returns the static props for a page.
 */
export type GetStaticProps<T> = (context: {
	pathname: StaticPath;
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
}) => Promise<{
	props: T;
}>;

/**
 * Represents a page file in EcoPages.
 * @template T - The type of the page props.
 */
export type EcoPageFile<T = unknown> = T & {
	default: EcoComponent;
	getStaticPaths?: GetStaticPaths;
	getStaticProps?: GetStaticProps<Record<string, unknown>>;
	getMetadata?: GetMetadata;
};

/**
 * Represents a CSS processor.
 */
export interface CssProcessor {
	/**
	 * Processes a CSS file at the specified path.
	 * @param path - The path to the CSS file.
	 * @returns A promise that resolves to the processed CSS as a string.
	 */
	processPath: (path: string, options?: any) => Promise<string>;

	/**
	 * Processes a CSS string or buffer.
	 * @param contents - The CSS contents as a string or buffer.
	 * @returns A promise that resolves to the processed CSS as a string.
	 */
	processStringOrBuffer: (contents: string | Buffer, options?: any) => Promise<string>;
}

/**
 * The options for the route renderer.
 */
export type RouteRendererOptions = {
	file: string;
	params?: PageParams;
	query?: PageQuery;
};

/**
 * The body of the route renderer.
 */
export type RouteRendererBody = BodyInit | Readable;

/**
 * Represents the dependencies required for an integration plugin.
 * It combines the base integration plugin dependencies with specific integration plugin dependencies.
 */
export type IntegrationPluginDependencies = BaseIntegrationPluginDependencies & SpecificIntegrationPluginDependencies;

type BaseIntegrationPluginDependencies = {
	inline?: boolean;
};

/**
 * Represents the dependencies required for a specific integration plugin.
 * It can be one of the following types:
 * {@link ScriptImportIntegrationPluginDependencies}
 * {@link ScriptContentIntegrationPluginDependencies}
 * {@link StylesheetImportIntegrationPluginDependencies}
 * {@link StylesheetContentIntegrationPluginDependencies}
 */
type SpecificIntegrationPluginDependencies =
	| ScriptImportIntegrationPluginDependencies
	| ScriptContentIntegrationPluginDependencies
	| StylesheetImportIntegrationPluginDependencies
	| StylesheetContentIntegrationPluginDependencies;

/**
 * Script dependencies for an integration plugin with an import path.
 */
type ScriptImportIntegrationPluginDependencies = {
	kind: 'script';
	importPath: string;
	position?: 'head' | 'body';
	/** @default true */
	minify?: boolean;
};

/**
 * Script dependencies for an integration plugin with content.
 */
type ScriptContentIntegrationPluginDependencies = {
	kind: 'script';
	content: string;
	position?: 'head' | 'body';
	/** @default true */
	minify?: boolean;
};

/**
 * Stylesheet dependencies for an integration plugin with an import path.
 */
type StylesheetImportIntegrationPluginDependencies = {
	kind: 'stylesheet';
	importPath: string;
};

/**
 * Stylesheet dependencies for an integration plugin with content.
 */
type StylesheetContentIntegrationPluginDependencies = {
	kind: 'stylesheet';
	content: string;
};

/**
 * The options for the integration renderer.
 */
export type IntegrationRendererRenderOptions<C = EcoPagesElement> = RouteRendererOptions & {
	props?: Record<string, unknown>;
	metadata: PageMetadataProps;
	HtmlTemplate: EcoComponent<HtmlTemplateProps, C>;
	Page: EcoComponent<PageProps, C>;
	dependencies?: EcoComponentDependencies;
	resolvedDependencies: ProcessedAsset[];
	pageProps?: Record<string, unknown>;
};

/**
 * Represents a deep required type for a given object
 */
export type DeepRequired<T> = Required<{
	[K in keyof T]: T[K] extends Required<T[K]> ? T[K] : DeepRequired<T[K]>;
}>;

/**
 * The Prettify helper is a utility type that takes an object type and makes the hover overlay more readable.
 */
export type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

/**
 * Context provided to the API handler.
 */
export interface ApiHandlerContext<TRequest extends Request = Request, TServer = any> {
	request: TRequest;
	response: ApiResponseBuilder;
	server: TServer;
}

/**
 * Represents an API handler in EcoPages.
 * It defines the path, method, and handler function for the API endpoint.
 */
export interface ApiHandler<TPath extends string = string, TRequest extends Request = Request, TServer = any> {
	path: TPath;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
	handler: (context: ApiHandlerContext<TRequest, TServer>) => Promise<Response> | Response;
}
