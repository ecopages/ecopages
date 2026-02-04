import type { Readable } from 'node:stream';
import type { BunPlugin } from 'bun';
import type { ApiResponseBuilder } from './adapters/shared/api-response.js';
import type { EcoPageComponent } from './eco/eco.types.ts';
import type { EcoPagesAppConfig } from './internal-types.ts';
import type { HmrStrategy } from './hmr/hmr-strategy.ts';
import type { ProcessedAsset } from './services/asset-processing-service/assets.types.ts';
import type { CacheStats, CacheStrategy } from './services/cache/cache.types.ts';

export type { EcoPageComponent } from './eco/eco.types.ts';

import type {
	StandardSchema,
	StandardSchemaResult,
	StandardSchemaSuccessResult,
	StandardSchemaFailureResult,
	StandardSchemaIssue,
	InferOutput,
} from './services/validation/standard-schema.types.ts';

export type {
	StandardSchema,
	StandardSchemaResult,
	StandardSchemaSuccessResult,
	StandardSchemaFailureResult,
	StandardSchemaIssue,
	InferOutput,
};

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

	/**
	 * Absolute path to the layouts directory.
	 * Used to detect layout file changes that require full page reloads.
	 */
	getLayoutsDir(): string;
}

/**
 * Represents an event broadcast to connected clients via the ClientBridge.
 */
export type ClientBridgeEvent = {
	/**
	 * Event type: 'reload' triggers full refresh, 'update' for JS modules, 'css-update' for stylesheets, 'layout-update' for layout changes
	 */
	type: 'reload' | 'error' | 'update' | 'css-update' | 'layout-update';
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
 * Contains component file path and integration info for dependency resolution.
 * @internal
 */
export interface EcoInjectedMeta {
	/** Hashed identifier for client-side use (doesn't expose file paths) */
	id: string;
	/** Full file path of the component (use path.dirname() to get directory) */
	file: string;
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
export type PageProps<T = unknown> = T & StaticPageContext & { locals?: RequestLocals };

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
 * Request-scoped data that is only available during request-time rendering.
 *
 * Apps should augment this interface via module augmentation:
 *
 * declare module '@ecopages/core' {
 *   interface RequestLocals { session?: Session | null }
 * }
 */
export interface RequestLocals {}

/**
 * Represents the context object for a static page.
 */
export type StaticPageContext = {
	params?: PageParams;
	query?: PageQuery;
};

/**
 * Request-time page context.
 *
 * This is only populated during SSR. Static generation must not access locals.
 */
export type RequestPageContext = {
	locals: RequestLocals;
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
	locals?: RequestLocals;
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
	 * Request-scoped data store.
	 * Only valid during request-time handling (SSR/API). Must not be used for static generation.
	 */
	locals: RequestLocals;
	/**
	 * Require one or more locals keys. If missing, executes `onMissing` to produce a terminating Response.
	 */
	require: {
		<K extends keyof RequestLocals>(key: K, onMissing: () => Response): Exclude<RequestLocals[K], null | undefined>;
		<K extends keyof RequestLocals>(
			keys: readonly K[],
			onMissing: () => Response,
		): { [P in K]-?: Exclude<RequestLocals[P], null | undefined> };
	};
	/**
	 * Services available to the API handler.
	 */
	services: ApiHandlerServices;
	/**
	 * Parsed and optionally validated request body.
	 *
	 * - Without schema: Contains the parsed JSON body as `unknown`
	 * - With schema: Contains the validated and type-safe body data
	 *
	 * For raw access to the request body stream, use `ctx.request.body`.
	 *
	 * @example Without validation
	 * ```typescript
	 * app.post('/posts', async (ctx) => {
	 *   const data = ctx.body; // [unknown] - parsed JSON
	 *   return ctx.json({ received: data });
	 * });
	 * ```
	 *
	 * @example With validation
	 * ```typescript
	 * import { z } from 'zod';
	 *
	 * app.post('/posts', async (ctx) => {
	 *   const { title, author } = ctx.body; // [type-safe]
	 *   return ctx.json({ title, author });
	 * }, {
	 *   schema: {
	 *     body: z.object({ title: z.string(), author: z.string() })
	 *   }
	 * });
	 * ```
	 *
	 * Validation runs before the handler executes. Invalid requests receive a 400 response.
	 */
	body?: unknown;
	/**
	 * Parsed and optionally validated query parameters.
	 *
	 * - Without schema: Contains the parsed query params as a string record
	 * - With schema: Contains the validated and type-safe query data
	 *
	 * For raw access to query parameters, use `ctx.request.url` and parse manually.
	 *
	 * @example Pagination with type coercion
	 * ```typescript
	 * import { z } from 'zod';
	 *
	 * app.get('/posts', async (ctx) => {
	 *   const { page, limit, sortBy } = ctx.query;
	 *   // page: number, limit: number, sortBy: 'date' | 'title' | 'views'
	 *   return ctx.json({ page, limit, sortBy });
	 * }, {
	 *   schema: {
	 *     query: z.object({
	 *       page: z.coerce.number().min(1).default(1),
	 *       limit: z.coerce.number().min(1).max(100).default(20),
	 *       sortBy: z.enum(['date', 'title', 'views']).default('date')
	 *     })
	 *   }
	 * });
	 * ```
	 *
	 * @example Search with filters
	 * ```typescript
	 * app.get('/search', async (ctx) => {
	 *   const { q, category } = ctx.query;
	 *   return ctx.json({ results: await search(q, category) });
	 * }, {
	 *   schema: {
	 *     query: z.object({
	 *       q: z.string().min(2).max(100),
	 *       category: z.enum(['posts', 'users', 'comments']).optional()
	 *     })
	 *   }
	 * });
	 * ```
	 */
	query?: unknown;
	/**
	 * Parsed and optionally validated request headers.
	 *
	 * - Without schema: Contains the parsed headers as a string record
	 * - With schema: Contains the validated and type-safe header data
	 *
	 * For raw access to headers, use `ctx.request.headers`.
	 *
	 * @example API key authentication
	 * ```typescript
	 * import { z } from 'zod';
	 *
	 * app.post('/api/webhooks', async (ctx) => {
	 *   const apiKey = ctx.headers['x-api-key'];
	 *   // apiKey is guaranteed to be a valid UUID
	 *   return ctx.json({ received: true });
	 * }, {
	 *   schema: {
	 *     headers: z.object({
	 *       'x-api-key': z.string().uuid()
	 *     })
	 *   }
	 * });
	 * ```
	 *
	 * @example Webhook signature validation
	 * ```typescript
	 * app.post('/webhooks/stripe', async (ctx) => {
	 *   const signature = ctx.headers['stripe-signature'];
	 *   // signature is guaranteed to exist
	 *   const isValid = verifyStripeSignature(ctx.body, signature);
	 *   return ctx.json({ verified: isValid });
	 * }, {
	 *   schema: {
	 *     headers: z.object({
	 *       'stripe-signature': z.string().min(1)
	 *     })
	 *   }
	 * });
	 * ```
	 *
	 * @example Content negotiation
	 * ```typescript
	 * app.post('/api/data', async (ctx) => {
	 *   const { accept } = ctx.headers;
	 *   if (accept === 'application/xml') {
	 *     return ctx.html(toXml(data), { headers: { 'Content-Type': 'application/xml' } });
	 *   }
	 *   return ctx.json(data);
	 * }, {
	 *   schema: {
	 *     headers: z.object({
	 *       'content-type': z.literal('application/json'),
	 *       accept: z.enum(['application/json', 'application/xml']).optional()
	 *     })
	 *   }
	 * });
	 * ```
	 */
	headers?: unknown;
}

/**
 * Next function for middleware chain.
 * Call to continue to the next middleware or final handler.
 */
export type MiddlewareNext = () => Promise<Response>;

/**
 * Middleware function signature.
 * Receives the request context and a next function to continue the chain.
 * Can short-circuit by returning a Response directly without calling next().
 *
 * @typeParam TRequest - Request type
 * @typeParam TServer - Server type
 * @typeParam TContext - Extended context type, defaults to base ApiHandlerContext
 *
 * @example Basic middleware (no context extension)
 * ```typescript
 * const loggingMiddleware: Middleware = async (ctx, next) => {
 *   console.log(`${ctx.request.method} ${ctx.request.url}`);
 *   return next();
 * };
 * ```
 *
 * @example Middleware with extended context (use EcoMiddleware helper)
 * ```typescript
 * type AuthContext = ApiHandlerContext<BunRequest<string>, Server> & { user: User };
 *
 * const authMiddleware: EcoMiddleware<AuthContext> = async (ctx, next) => {
 *   const user = await authenticate(ctx.request);
 *   if (!user) return ctx.response.status(401).json({ error: 'Unauthorized' });
 *   ctx.user = user;
 *   return next();
 * };
 * ```
 */
export type Middleware<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> = (context: TContext, next: MiddlewareNext) => Promise<Response> | Response;

/**
 * Helper type for defining middleware with extended context.
 * Automatically infers TRequest and TServer from the provided context type.
 *
 * @typeParam TContext - The extended context type that includes TRequest and TServer
 *
 * @example
 * ```typescript
 * type AuthContext = ApiHandlerContext<BunRequest<string>, Server> & {
 *   session: { user: User };
 * };
 *
 * const authMiddleware: EcoMiddleware<AuthContext> = async (ctx, next) => {
 *   const session = await authenticate(ctx.request);
 *   if (!session) return Response.redirect('/login');
 *   ctx.session = session;
 *   return next();
 * };
 * ```
 */
export type EcoMiddleware<TContext extends ApiHandlerContext<any, any>> =
	TContext extends ApiHandlerContext<infer TRequest, infer TServer> ? Middleware<TRequest, TServer, TContext> : never;

/**
 * Represents an API handler in EcoPages.
 * Defines the path, method, handler function, optional middleware, and validation schemas.
 *
 * @example Basic handler
 * ```typescript
 * app.get('/users/:id', async (ctx) => {
 *   return ctx.json({ id: ctx.request.params.id });
 * });
 * ```
 *
 * @example With validation
 * ```typescript
 * import { z } from 'zod';
 *
 * app.post('/posts', async (ctx) => {
 *   const { title, content } = ctx.body;
 *   return ctx.json({ success: true, title, content });
 * }, {
 *   schema: {
 *     body: z.object({
 *       title: z.string().min(3),
 *       content: z.string()
 *     })
 *   }
 * });
 * ```
 *
 * @example With middleware
 * ```typescript
 * const authMiddleware = async (ctx, next) => {
 *   if (!ctx.request.headers.get('authorization')) {
 *     return ctx.response.status(401).json({ error: 'Unauthorized' });
 *   }
 *   return next();
 * };
 *
 * app.get('/protected', async (ctx) => {
 *   return ctx.json({ message: 'Secret data' });
 * }, {
 *   middleware: [authMiddleware]
 * });
 * ```
 *
 * @example Multiple validations
 * ```typescript
 * import { z } from 'zod';
 *
 * app.post('/api/search', async (ctx) => {
 *   const { q, page } = ctx.query;
 *   const filters = ctx.body;
 *   return ctx.json({ query: q, page, filters });
 * }, {
 *   schema: {
 *     query: z.object({ q: z.string(), page: z.string() }),
 *     body: z.object({ category: z.string().optional() })
 *   }
 * });
 * ```
 */
export interface ApiHandler<TPath extends string = string, TRequest extends Request = Request, TServer = any> {
	path: TPath;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
	handler: (context: ApiHandlerContext<TRequest, TServer>) => Promise<Response> | Response;
	/** Optional middleware chain executed before the handler */
	middleware?: Middleware<TRequest, TServer, any>[];
	/** Optional validation schemas for request body, query parameters, and headers */
	schema?: {
		body?: StandardSchema;
		query?: StandardSchema;
		headers?: StandardSchema;
	};
}

/**
 * Global error handler for centralized error handling across all routes.
 * Receives the error and full request context, returns a Response.
 * Falls back to default handling if the handler itself throws.
 */
export type ErrorHandler<TRequest extends Request = Request, TServer = any> = (
	error: unknown,
	context: ApiHandlerContext<TRequest, TServer>,
) => Promise<Response> | Response;

/**
 * Options for route handlers.
 */
export interface RouteOptions<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> {
	middleware?: Middleware<TRequest, TServer, TContext>[];
	schema?: RouteSchema;
}

export interface RouteSchema {
	body?: StandardSchema;
	query?: StandardSchema;
	headers?: StandardSchema;
}

/**
 * Helper type to extract inferred types from a schema, with fallback to unknown.
 */
export type InferSchemaOutput<T> = T extends StandardSchema ? InferOutput<T> : unknown;

/**
 * Context with typed body/query/headers based on the provided schema.
 */
export type TypedApiHandlerContext<
	TSchema extends RouteSchema,
	TRequest extends Request = Request,
	TServer = any,
> = Omit<ApiHandlerContext<TRequest, TServer>, 'body' | 'query' | 'headers'> & {
	body: InferSchemaOutput<TSchema['body']>;
	query: InferSchemaOutput<TSchema['query']>;
	headers: InferSchemaOutput<TSchema['headers']>;
};

/**
 * Options for the group method.
 *
 * @typeParam TContext - Extended context type that middleware provides to handlers
 *
 * @example Group with auth middleware extending context
 * ```typescript
 * type AuthContext = ApiHandlerContext<BunRequest<string>, Server> & { user: User };
 *
 * app.group<AuthContext>('/api', (r) => {
 *   r.get('/profile', (ctx) => {
 *     // ctx.user is properly typed!
 *     return ctx.json({ name: ctx.user.name });
 *   });
 * }, { middleware: [authMiddleware] });
 * ```
 */
export interface GroupOptions<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> {
	middleware?: Middleware<TRequest, TServer, TContext>[];
}

/**
 * Context type that combines schema-typed fields with an extended base context.
 * Used by RouteGroupBuilder to merge schema validation types with middleware-extended context.
 * Note: Path parameter typing (e.g., :id -> params.id) comes from the TContext.request type.
 */
export type TypedGroupHandlerContext<
	TSchema extends RouteSchema,
	TContext extends ApiHandlerContext<any, any>,
	TRequest extends Request = Request,
> = Omit<TContext, 'body' | 'query' | 'headers' | 'request'> & {
	body: InferSchemaOutput<TSchema['body']>;
	query: InferSchemaOutput<TSchema['query']>;
	headers: InferSchemaOutput<TSchema['headers']>;
	request: TRequest;
};

/**
 * Builder interface for defining routes within a group.
 * Provides chainable methods for registering routes with shared prefix and middleware.
 *
 * @typeParam TRequest - The request type
 * @typeParam TServer - The server type
 * @typeParam TContext - Extended context type from group middleware
 */
export interface RouteGroupBuilder<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> {
	get<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	post<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	put<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	delete<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	patch<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	options<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	head<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext, TRequest>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;
}

/**
 * A function that dynamically imports a view module.
 * Used by app.static() to enable HMR in development.
 */
export type ViewLoader<P = any> = () => Promise<{ default: EcoPageComponent<P> }>;

/**
 * Represents a static route registered via app.static().
 * Uses a loader function to enable HMR in development mode.
 */
export interface StaticRoute<P = any> {
	path: string;
	loader: ViewLoader<P>;
}
