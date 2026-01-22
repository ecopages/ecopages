import type { Readable } from 'node:stream';
import type { BunPlugin } from 'bun';
import type { ApiResponseBuilder } from './adapters/shared/api-response.js';
import type { EcoPageComponent } from './eco/eco.types.ts';
import type { EcoPagesAppConfig } from './internal-types.ts';
import type { HmrStrategy } from './hmr/hmr-strategy.ts';
import type { ProcessedAsset } from './services/asset-processing-service/assets.types.ts';
import type { CacheStats, CacheStrategy } from './services/cache/cache.types.ts';

export type { EcoPageComponent } from './eco/eco.types.ts';

/**
 * Narrow interface for cache invalidation in API handlers.
 * Exposes only the methods needed for programmatic cache control.
 */
export interface CacheInvalidator {
	/**
	 * Invalidate all cached entries matching any of the provided tags.
	 * @param tags - Array of tags to invalidate
	 * @returns Number of entries invalidated
	 */
	invalidateByTags(tags: string[]): Promise<number>;

	/**
	 * Invalidate cached entries by exact path.
	 * @param paths - Array of URL paths to invalidate
	 * @returns Number of entries invalidated
	 */
	invalidateByPaths(paths: string[]): Promise<number>;

	/**
	 * Clear all cached entries.
	 */
	clear(): Promise<void>;

	/**
	 * Get cache statistics for debugging.
	 */
	stats(): Promise<CacheStats>;
}

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
	/**
	 * Lazy dependencies - scripts/stylesheets loaded on user interaction or visibility.
	 * Supports three trigger modes: on:idle, on:interaction, and on:visible.
	 */
	lazy?:
		| ({ 'on:idle': true } & { scripts?: string[]; stylesheets?: string[] })
		| ({ 'on:interaction': string } & { scripts?: string[]; stylesheets?: string[] })
		| ({ 'on:visible': true | string } & { scripts?: string[]; stylesheets?: string[] });
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
 * Internal metadata injected by eco-component-meta-plugin.
 * Contains component directory and integration info for dependency resolution.
 * @internal
 */
export interface EcoInjectedMeta {
	/** Directory path of the component */
	dir: string;
	/** The integration identifier (e.g., 'react', 'kitajs', 'lit', 'ghtml', 'mdx') */
	integration: string;
}

export type EcoComponentConfig = {
	/** @internal Injected by eco-component-meta-plugin */
	__eco?: EcoInjectedMeta;
	/**
	 * The layout component to wrap this page during rendering.
	 *
	 * The layout receives the page content as `children` and is responsible for
	 * providing the page structure (header, footer, navigation, etc.).
	 *
	 * For React pages with client-side routing, the layout also handles the router context.
	 * Use `EcoRouter` and `PageContent` from `@ecopages/react-router` in layouts that
	 * need SPA navigation support.
	 *
	 * @example
	 * ```tsx
	 * // Simple layout (no routing)
	 * const Layout = ({ children }) => <main>{children}</main>;
	 *
	 * // Layout with SPA routing
	 * const Layout = ({ children }) => (
	 *   <EcoRouter page={...} pageProps={...}>
	 *     <Header />
	 *     <PageContent />
	 *   </EcoRouter>
	 * );
	 *
	 * // Page using the layout
	 * const MyPage = () => <h1>Hello</h1>;
	 * MyPage.config = { layout: Layout };
	 * ```
	 */
	layout?: EcoComponent;
	dependencies?: EcoComponentDependencies;
	/**
	 * Internal: Comma-separated resolved script paths for lazy dependencies.
	 * Set by the renderer, used by eco.component() for auto-wrapping.
	 * @internal
	 */
	_resolvedScripts?: string;
};

/**
 * The base structure for any EcoPages component.
 */
export type EcoComponentBase = {
	/**
	 * The configuration options for the EcoComponent.
	 */
	config?: EcoComponentConfig;

	/**
	 * Static paths for dynamic routes (consolidated eco.page API).
	 * @internal Used by the renderer to retrieve static paths from the page component.
	 */
	staticPaths?: GetStaticPaths;

	/**
	 * Static props fetcher (consolidated eco.page API).
	 * @internal Used by the renderer to retrieve static props from the page component.
	 */
	staticProps?: GetStaticProps<any>;

	/**
	 * Metadata generator (consolidated eco.page API).
	 * @internal Used by the renderer to retrieve metadata from the page component.
	 */
	metadata?: GetMetadata<any>;
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
	default: EcoComponent<any, any>;
	getStaticPaths?: GetStaticPaths;
	getStaticProps?: GetStaticProps<Record<string, unknown>>;
	getMetadata?: GetMetadata;
	cache?: CacheStrategy;
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
 * Result of rendering a route, including body and optional cache configuration.
 */
export type RouteRenderResult = {
	body: RouteRendererBody;
	/** Cache strategy from page component's eco.page({ cache }) option */
	cacheStrategy?: CacheStrategy;
};

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
	Layout?: EcoComponent;
	dependencies?: EcoComponentDependencies;
	resolvedDependencies: ProcessedAsset[];
	pageProps?: Record<string, unknown>;
	cacheStrategy?: CacheStrategy;
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
 * Services available to API handlers.
 */
export interface ApiHandlerServices {
	/**
	 * Cache invalidation service.
	 * Null when caching is disabled.
	 */
	cache: CacheInvalidator | null;
}

/**
 * Options for rendering a view.
 */
export interface RenderOptions {
	status?: number;
	headers?: HeadersInit;
}

/**
 * Options for JSON/HTML response helpers.
 */
export interface ResponseOptions {
	status?: number;
	headers?: HeadersInit;
}

/**
 * Context for rendering views in route handlers.
 * Provides methods to render eco.page views and return formatted responses.
 */
export interface RenderContext {
	/**
	 * Render an eco.page view with full layout and includes.
	 * @param view - The eco.page component to render
	 * @param props - Props to pass to the view
	 * @param options - Optional status code and headers
	 */
	render<P = Record<string, unknown>>(view: EcoComponent<P>, props: P, options?: RenderOptions): Promise<Response>;

	/**
	 * Render an eco.page view without layout (for partials/fragments).
	 * @param view - The eco.page component to render
	 * @param props - Props to pass to the view
	 * @param options - Optional status code and headers
	 */
	renderPartial<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		options?: RenderOptions,
	): Promise<Response>;

	/**
	 * Return a JSON response.
	 * @param data - Data to serialize as JSON
	 * @param options - Optional status code and headers
	 */
	json(data: unknown, options?: ResponseOptions): Response;

	/**
	 * Return an HTML response.
	 * @param content - HTML string content
	 * @param options - Optional status code and headers
	 */
	html(content: string, options?: ResponseOptions): Response;
}

/**
 * Context provided to the API handler.
 */
export interface ApiHandlerContext<TRequest extends Request = Request, TServer = any> extends RenderContext {
	request: TRequest;
	response: ApiResponseBuilder;
	server: TServer;
	/**
	 * Services available to the API handler.
	 */
	services: ApiHandlerServices;
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

/**
 * Represents a static route registered via app.static().
 * Used for explicit routing where views are rendered at build time.
 */
export interface StaticRoute {
	path: string;
	view: EcoPageComponent<any>;
}
