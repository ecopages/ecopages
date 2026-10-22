import type { Readable } from 'node:stream';
import type { ComponentIdentity } from './component-identity.ts';
import type { ApiResponseBuilder } from './api-response.ts';
import type { AssetDefinition, ProcessedAsset } from './asset-types.ts';
import type { CacheStats, CacheStrategy } from './cache-types.ts';
import type { InteractionEventsString as ScriptsInjectorInteractionEventsString } from '@ecopages/scripts-injector/types';
import type { DevTransformBundleContributor } from './dev-transform-types.ts';
import type {
	StandardSchema,
	StandardSchemaResult,
	StandardSchemaSuccessResult,
	StandardSchemaFailureResult,
	StandardSchemaIssue,
	InferOutput,
	StandardSchemaV1,
} from './standard-schema-types.ts';

export type { CacheConfig } from './cache-types.ts';
export type { AssetDefinition, ProcessedAsset } from './asset-types.ts';
export type {
	StandardSchema,
	StandardSchemaResult,
	StandardSchemaSuccessResult,
	StandardSchemaFailureResult,
	StandardSchemaIssue,
	InferOutput,
	StandardSchemaV1,
};

export type HmrStrategyContract = {
	readonly type: number;
	readonly priorityOffset: number;
	readonly priority: number;
	matches(filePath: string): boolean;
	ownsDevTransformEntrypoint(sourcePath: string): boolean;
	process(filePath: string): Promise<HmrAction>;
};

type RequiresKeys = keyof RequestLocals;

export type PageRequires<K extends RequiresKeys = RequiresKeys> = K | readonly K[];

export type GetPageDependenciesContext<T = Record<string, unknown>> = {
	props: PagePropsFor<T>;
	params?: PageParams;
	query?: PageQuery;
};

export type FileOwnedDependencyContribution = EcoComponentDependencies & {
	ownerFile?: string;
};

export type PageDependenciesResult = FileOwnedDependencyContribution & {
	contributions?: FileOwnedDependencyContribution[];
};

export type GetPageDependencies<T = Record<string, unknown>> = (
	context: GetPageDependenciesContext<T>,
) => PageDependenciesResult | undefined | Promise<PageDependenciesResult | undefined>;

export type PageDependenciesInput<T = Record<string, unknown>> = EcoComponentDependencies | GetPageDependencies<T>;

/**
 * Runtime-agnostic incoming WebSocket frame.
 *
 * Node `ws` delivers text and binary frames; this discriminated
 * union lets handlers deal with both without casts.
 */
export type IncomingWebSocketMessage =
	{ readonly kind: 'text'; readonly text: string } | { readonly kind: 'binary'; readonly data: Uint8Array };

/**
 * Runtime-agnostic outgoing WebSocket payload.
 *
 * Strings are sent as text frames. Anything binary-shaped is sent as binary
 * frames. `Blob` is included for cross-runtime parity and is normalized to a
 * binary frame by each adapter.
 */
export type OutgoingWebSocketMessage = string | Uint8Array | ArrayBuffer | ArrayBufferView | Blob;

/**
 * Close event delivered to `onClose` after a connection terminates.
 */
export interface WebSocketCloseInfo {
	readonly code: number;
	readonly reason: string;
	readonly wasClean: boolean;
}

/**
 * Input passed to a WebSocket handler's `context()` factory.
 *
 * Adapters call `context()` exactly once per accepted upgrade. The returned
 * value becomes `socket.context` and is shared by all lifecycle hooks.
 */
interface WebSocketContextFactoryInput<TParams extends Record<string, string> = Record<string, string>> {
	readonly request: Request;
	readonly kind: string;
	readonly params: TParams;
	readonly search: Readonly<PageQuery>;
	readonly locals?: RequestLocals;
}

/**
 * Runtime-agnostic WebSocket socket view exposed to handlers.
 *
 * Framework-owned fields:
 * - `kind`: the registered route pattern (e.g. '/ws/chat/:roomId')
 * - `params`: dynamic segments captured at match time
 * - `search`: query string parameters, shaped like {@link PageQuery}: a repeated key is an array
 *
 * App-owned field:
 * - `context`: returned by the handler's `context()` factory
 */
export interface EcopagesSocket<TContext = unknown, TParams extends Record<string, string> = Record<string, string>> {
	readonly kind: string;
	readonly params: TParams;
	readonly search: Readonly<PageQuery>;
	readonly context: TContext;
	send(message: OutgoingWebSocketMessage): void;
	sendStream(stream: ReadableStream<Uint8Array>): Promise<void>;
	close(code?: number, reason?: string): void;
}

/**
 * Connection-lifecycle handler object.
 *
 * All hooks are optional. `context()` is the one-time initializer that
 * produces the per-connection state shared by the lifecycle hooks. Returning
 * a rejected promise from `context()` aborts the upgrade.
 */
export interface EcopagesWebSocketHandler<
	TContext = unknown,
	TParams extends Record<string, string> = Record<string, string>,
> {
	context?(input: WebSocketContextFactoryInput<TParams>): TContext | Promise<TContext>;
	onConnect?(socket: EcopagesSocket<TContext, TParams>): void | Promise<void>;
	onMessage?(socket: EcopagesSocket<TContext, TParams>, message: IncomingWebSocketMessage): void | Promise<void>;
	onClose?(socket: EcopagesSocket<TContext, TParams>, event: WebSocketCloseInfo): void | Promise<void>;
	onError?(socket: EcopagesSocket<TContext, TParams>, error: unknown): void | Promise<void>;
}
type InteractionEventsString = ScriptsInjectorInteractionEventsString;

export type DependencyLazyTrigger =
	{ 'on:idle': true } | { 'on:interaction': InteractionEventsString } | { 'on:visible': true | string };

export type DependencyAttributes = Record<string, string>;

export type EcoComponentStylesheetEntry = {
	src?: string;
	content?: string;
	attributes?: DependencyAttributes;
};

export type EcoComponentScriptEntry = {
	src?: string;
	content?: string;
	attributes?: DependencyAttributes;
	lazy?: DependencyLazyTrigger;
	ssr?: boolean;
};

export type LazyTriggerRule =
	| { 'on:idle': { scripts: string[] } }
	| { 'on:interaction': { value: string; scripts: string[] } }
	| { 'on:visible': { value?: string; scripts: string[] } };

export type ResolvedLazyTrigger = {
	triggerId: string;
	rules: LazyTriggerRule[];
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
	 * Invalidate cached entries by pathname, across query and fragment variants.
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
 * Provides access to registered entrypoints and build configuration.
 */
export interface DefaultHmrContext {
	/**
	 * Map of registered entrypoint source paths to their dev-transform output URLs.
	 */
	getWatchedFiles(): Map<string, string>;

	getRegisteredEntrypoints(): ReadonlyMap<string, ResolvedHmrEntrypoint>;

	/**
	 * Absolute path to the source directory.
	 */
	getSrcDir(): string;

	/**
	 * Absolute path to the layouts directory.
	 * Used to detect layout file changes that require full page reloads.
	 */
	getLayoutsDir(): string;

	/**
	 * Absolute path to the pages directory.
	 * Used by plugins to identify page files for transformation.
	 */
	getPagesDir(): string;

	/**
	 * Server-side module loader owned by the active app/runtime.
	 */
	importServerModule<T = unknown>(filePath: string | URL): Promise<T>;

	/**
	 * Entrypoint dependency graph for selective HMR invalidation.
	 */
	getEntrypointDependencyGraph(): {
		getDependencyEntrypoints(filePath: string): Set<string>;
	};
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

export interface HmrAction {
	type: 'broadcast' | 'none';
	events?: ClientBridgeEvent[];
}

/**
 * Options for handling a development file change through HMR.
 */
export type HmrFileChangeOptions = {
	broadcast?: boolean;
};

/**
 * Integration callback for registered `dependencies.scripts` entrypoint changes in development.
 *
 * @remarks
 * Returning `true` marks the script entrypoint as requiring a full page reload instead of an in-place HMR update.
 */
export type RegisteredScriptEntrypointChangeHandler = (filePath: string) => void | boolean | Promise<void | boolean>;

/**
 * Adapter-agnostic interface for broadcasting development events to connected clients.
 * Implemented by the Node client bridge.
 */
export interface IClientBridge {
	broadcast(event: ClientBridgeEvent): void;
	reload(): void;
	cssUpdate(path: string): void;
	update(path: string): void;
	error(message: string): void;
	subscriberCount: number;
}

export interface ResolvedHmrEntrypoint {
	sourcePath: string;
	/**
	 * Emitted artifact path for disk-based HMR, or the resolved source path for
	 * dev-transform entrypoints where modules are served on demand.
	 */
	outputPath: string;
	outputUrl: string;
	role: 'page' | 'script';
}

/**
 * Interface for the HMR Manager.
 * Used by integration plugins to register entrypoints and strategies.
 */
export interface IHmrManager {
	/**
	 * Registers a client entrypoint for dev-transform delivery and HMR watching.
	 *
	 * @remarks
	 * Returns a stable `/assets/__eco_dev__/…` URL immediately; the module is
	 * transpiled on the first browser request (per-file ESM, not a page bundle).
	 */
	registerEntrypoint(entrypointPath: string): Promise<string>;

	/**
	 * Registers an integration contributor that supplies per-module transform plugins.
	 */
	registerDevTransformContributor(contributor: DevTransformBundleContributor): void;

	registerScriptEntrypoint(entrypointPath: string): Promise<ResolvedHmrEntrypoint>;

	/** Serves a requested module from the active development transform server, when the path is managed by HMR. */
	tryHandleDevClientRequest(request: Request): Promise<Response | null>;

	/**
	 * Registers a custom HMR strategy.
	 */
	registerStrategy(strategy: HmrStrategyContract): void;

	/**
	 * @remarks
	 * Handlers belong to this HMR session and are cleared when {@link stop} runs. Returning `true` from a handler
	 * forces a full page reload instead of an in-place script update.
	 */
	onScriptEntrypointChanged?(handler: RegisteredScriptEntrypointChangeHandler): void;

	/**
	 * Enables or disables HMR.
	 */
	setEnabled(enabled: boolean): void;

	/**
	 * Stops active HMR watchers and releases dev-time resources.
	 */
	stop(): void;

	/**
	 * Returns whether HMR is enabled.
	 */
	isEnabled(): boolean;

	/**
	 * Broadcasts an HMR event to connected clients.
	 */
	broadcast(event: ClientBridgeEvent): void;

	/**
	 * Returns an existing emitted HMR script artifact without registering it.
	 */
	getResolvedScriptOutput?(entrypointPath: string): ResolvedHmrEntrypoint | undefined;

	/**
	 * Gets the map of watched files.
	 */
	getWatchedFiles(): Map<string, string>;

	/**
	 * Gets registered dev-transform entrypoints keyed by resolved source path.
	 */
	getRegisteredEntrypoints(): ReadonlyMap<string, ResolvedHmrEntrypoint>;

	/**
	 * Serves a development HMR asset request when the URL matches a known HMR path.
	 */
	tryHandleAssetRequest(request: Request): Response | null;

	/**
	 * Loads the browser dev runtimes (the HMR client and, when configured, the Dev Toolbar client) from an
	 * HTML response. Returns the response unchanged while HMR is disabled.
	 */
	injectDevClientRuntimes(response: Response): Promise<Response>;

	/**
	 * Gets the default HMR context.
	 */
	getDefaultContext(): DefaultHmrContext;

	/**
	 * Handles all file changes from one watcher batch and coalesces their client update.
	 */
	handleFileChanges(paths: string[], options?: HmrFileChangeOptions): Promise<void>;
}

/**
 * Represents the dependencies for an EcoComponent.
 */
export type EcoComponentDependencies = {
	stylesheets?: Array<string | EcoComponentStylesheetEntry>;
	scripts?: Array<string | EcoComponentScriptEntry>;
	/**
	 * Browser module declarations resolved from node_modules.
	 *
	 * Supports grammar entries such as `react-aria-components{Table,Select}`
	 * to express explicit module imports for client bundles.
	 */
	modules?: string[];
	/**
	 * Child components whose assets and foreign-child graph are collected transitively.
	 * Each entry must be an `eco.component()`, `eco.layout()`, or `eco.html()` result
	 * with bound component identity.
	 */
	components?: EcoComponent[];
};

/**
 * Component returned from `eco.component()`, `eco.layout()`, or `eco.html()`.
 *
 * @remarks
 * Used for `dependencies.components` and eco factory return types. Bound
 * component identity is enforced at runtime via `isEcoDeclaredComponent()`.
 */
export type EcoPagesElement = string | Promise<string>;

/**
 * Serializable child payloads accepted by cross-integration deferred rendering.
 *
 * @remarks
 * Covers primitives, arrays, and Kita/Lit-style template results (`strings` /
 * optional `values`). Plain opaque objects are intentionally excluded; foreign
 * composition boundaries reject them before serializers can coerce `String(object)`.
 * Framework-native trees (React nodes, JSX elements) stay outside this type and
 * use EcoEmbed or already-serialized HTML at the boundary.
 */
export type EcoChildren =
	| string
	| Promise<string>
	| number
	| bigint
	| boolean
	| null
	| undefined
	| readonly EcoChildren[]
	| {
			strings: readonly string[];
			values?: readonly EcoChildren[];
	  };

export type EcoComponentConfig = {
	/** Canonical integration, module, and stable component attribution. */
	identity?: ComponentIdentity;
	/**
	 * Explicit integration override for this component.
	 * When provided, this takes precedence over auto-detected integration metadata.
	 */
	integration?: string;
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
	 * const MyPage = eco.page({ layout: Layout, render: () => <h1>Hello</h1> });
	 * ```
	 */
	/** Normalized outer→inner layout stack from `eco.page({ layout: [...] })`. */
	layouts?: EcoComponent[];
	/** Layout entries retained for per-tier prop factories. */
	layoutEntries?: EcoPageLayoutEntry[];
	dependencies?: EcoComponentDependencies;
};

/**
 * The base structure for any EcoPages component.
 */
type EcoComponentBase = {
	/**
	 * The configuration options for the EcoComponent.
	 */
	config?: EcoComponentConfig;

	/**
	 * Static paths for dynamic routes (consolidated eco.page API).
	 * Used by the renderer to retrieve static paths from the page component.
	 */
};

/**
 * Checks if a type is `any`.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

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

type ForeignChildInterceptionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
	props: Record<string, unknown>;
};

type ForeignChildInterceptionResult =
	{ kind: 'inline'; props?: Record<string, unknown> } | { kind: 'resolved'; value: string } | undefined;

/**
 * Renderer-provided policy for handing a component to its owning Integration.
 *
 * @remarks
 * Inline results stay in the current renderer. Resolved results contain serialized
 * output or a queue token for renderer-owned completion.
 */
export interface ForeignChildRuntime {
	interceptForeignChild?(
		input: ForeignChildInterceptionInput,
	): ForeignChildInterceptionResult | Promise<ForeignChildInterceptionResult>;
	interceptForeignChildSync?(
		input: ForeignChildInterceptionInput,
	): Exclude<ForeignChildInterceptionResult, undefined>;
}

/**
 * Represents a page in EcoPages.
 */
export type PageProps<T = unknown> = T & StaticPageContext & { locals?: RequestLocals };

/**
 * Page-level robots directives for the document head and sitemap filtering.
 *
 * @remarks
 * When `index` is `false`, the page is omitted from the auto-generated sitemap
 * for routes whose metadata can be resolved during static export (filesystem
 * pages and `app.static()` views with `metadata`). Defaults when omitted:
 * `index: true`, `follow: true`. A `<meta name="robots">` tag is emitted by the
 * route HTML finalization path when directives differ from those defaults.
 */
export interface PageRobotsMetadata {
	index?: boolean;
	follow?: boolean;
	nocache?: boolean;
}

/**
 * Represents the metadata for a page.
 */
export interface PageMetadataProps {
	title: string;
	description: string;
	image?: string;
	url?: string;
	keywords?: string[];
	robots?: PageRobotsMetadata;
}

/**
 * Configuration for automatic `sitemap.xml` generation during static export.
 *
 * @remarks
 * Disabled by default. When enabled, the sitemap is written after every page,
 * so files generated during export can be listed via `extraUrls`. Use `exclude` for bulk pathname filters and `metadata.robots.index: false`
 * for page-level noindex that also removes the URL from the sitemap when metadata
 * is available during export.
 */
export interface SitemapConfig {
	/** Emit sitemap.xml during static generation. @default false */
	enabled?: boolean;
	/** Output file name. @default "sitemap.xml" */
	fileName?: string;
	/**
	 * Extra, non-page URLs to include (e.g. "/rss.xml").
	 *
	 * @remarks
	 * Relative paths are resolved against `baseUrl`. Absolute `http(s)` URLs pass
	 * through. Always appended after page URLs; not filtered by `exclude` or page robots.
	 */
	extraUrls?: string[];
	/**
	 * Pathname patterns to exclude even if a page exists.
	 *
	 * @remarks
	 * Supported patterns: exact paths (`/admin`) and prefix wildcards (`/admin/**`).
	 * Unsupported patterns are treated as exact matches. This is not a full glob engine.
	 */
	exclude?: string[];
}

/**
 * Slim route descriptor for static-export hooks and runtime consumers.
 */
export interface EcopagesRouteInfo {
	/** Resolved URL pathname, e.g. `/blog/my-post`. */
	pathname: string;
	/** Route params for dynamic routes. Catch-all params contain decoded path-segment arrays. */
	params: PageParams;
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
 * Represents the props for a route layout.
 */
export interface LayoutProps<T = EcoPagesElement> extends Partial<RequestPageContext> {
	children: T;
}

/**
 * Represents the props for the HTML template of a page.
 */
export interface HtmlTemplateProps<T = EcoPagesElement> extends PageHeadProps<T> {
	children: T;
	language?: string;
	headContent?: T;
	pageProps: Record<string, unknown>;
	/**
	 * Browser-importable page module URL for router-enabled documents.
	 *
	 * @remarks
	 * Transport-only: threaded into HTML shells (for example `EcoPropsScript`
	 * `moduleUrl`) and serialized as the page-data envelope `moduleUrl`. Not page
	 * component state.
	 */
	pageModuleUrl?: string;
}

/**
 * Request-scoped context available to layout prop factories on `eco.page`.
 */
export type LayoutPropsContext = {
	params?: PageParams;
	query?: PageQuery;
	locals?: RequestLocals;
};

/**
 * One layout tier in a page layout stack (outer→inner).
 */
export type EcoPageLayoutEntry<E = EcoPagesElement> = {
	component: EcoComponent<any, E>;
	props?: (context: LayoutPropsContext) => Record<string, unknown>;
};

/**
 * Layout declaration accepted by `eco.page()`.
 *
 * @remarks
 * Array order is outer→inner, matching Next.js App Router segment nesting.
 */
export type EcoPageLayoutSpec<E = EcoPagesElement> = EcoComponent<any, E> | EcoPageLayoutEntry<E>;

/**
 * One or more layout tiers for `eco.page({ layout })`.
 *
 * @remarks
 * When an array, order is **outer → inner** (outermost layout wraps all inner tiers).
 * Normalized at factory time to `config.layouts` and `config.layoutEntries`.
 */
export type EcoPageLayouts<E = EcoPagesElement> = EcoPageLayoutSpec<E> | EcoPageLayoutSpec<E>[];

/**
 * Layout components accepted by pages.
 *
 * This preserves compatibility with existing `eco.component()` layouts while
 * also supporting semantic `eco.layout()` declarations.
 */
type EcoPageLayoutComponent<T = EcoPagesElement> = EcoLayoutComponent<T> | EcoComponent<any, T>;

/**
 * Represents a layout component created with eco.layout().
 */
export type EcoLayoutComponent<T = EcoPagesElement> = EcoComponent<LayoutProps<T>, T>;

/**
 * Represents an HTML shell component created with eco.html().
 */
export type EcoHtmlComponent<T = EcoPagesElement> = EcoComponent<HtmlTemplateProps, T>;

/**
 * Props passed to semantic HTML error pages (`pages/{status}.*` and `app.*()` loaders).
 *
 * @remarks
 * `status` is the HTTP status being rendered. `message` is the public `HttpError`
 * text for 4xx page-pipeline failures; unmatched URLs omit it. `stack` is only
 * passed for 5xx pages in development. Semantic error pages receive safe empty
 * `pageLocals` rather than request-scoped locals.
 */
export interface ErrorPageTemplateProps extends Omit<HtmlTemplateProps, 'children'> {
	status: number;
	message?: string;
	stack?: string;
}

/**
 * Represents the parameters for a page.
 * The keys are strings, and the values can be either a string or an array of strings.
 */
export type PageParams = Record<string, string | string[]>;

/**
 * Query parameters parsed from the URL.
 *
 * @remarks
 * A key that appears once is a string. A key repeated in the URL (`?tag=a&tag=b`)
 * is an array of its values in URL order, never just its last value. Page props,
 * API handlers (`ctx.query` and the value a query schema validates) and WebSocket
 * `search` all share this shape, so a schema that expects a plain string rejects
 * a repeated key with HTTP 400. Accept both with
 * `z.union([z.string(), z.array(z.string())])`.
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
 * Adds optional `locals` to a props type.
 * Primarily used for layouts that may receive request-scoped data from middleware.
 *
 * @template P - The base props type
 *
 * @example
 * ```ts
 * type MyLayoutProps = WithLocals<{ children: ReactNode }>;
 * // { children: ReactNode; locals?: RequestLocals }
 * ```
 */
export type WithLocals<P> = P & { locals?: RequestLocals };

/**
 * Represents the params for a static path.
 */
export type StaticPath = { params: PageParams };

export type EcoPagesAppConfig = {
	baseUrl: string;
	rootDir: string;
	srcDir: string;
	publicDir: string;
	pagesDir: string;
	includesDir: string;
	layoutsDir: string;
	distDir: string;
	workDir: string;
	templatesExt: string[];
	componentsDir: string;
	robotsTxt: { preferences: Record<string, string[]> };
	sitemap: SitemapConfig;
	additionalWatchPaths: string[];
	devPrewarmPaths?: string[];
	defaultMetadata: PageMetadataProps;
	absolutePaths: {
		config: string;
		configModuleFiles: string[];
		componentsDir: string;
		distDir: string;
		workDir: string;
		includesDir: string;
		layoutsDir: string;
		pagesDir: string;
		projectDir: string;
		publicDir: string;
		srcDir: string;
		htmlTemplatePath: string;
		errorPageTemplatePaths?: Record<400 | 401 | 403 | 404 | 409 | 500, string>;
		error404TemplatePath: string;
		error500TemplatePath: string;
	};
	devToolbar?: {
		enabled?: boolean;
		package?: string;
	};
};

export type PagePropsFor<T> =
	T extends GetStaticProps<infer P>
		? P & { params?: PageParams; query?: PageQuery }
		: T & { params?: PageParams; query?: PageQuery };

export type EcoPageComponent<T> = EcoComponent<PagePropsFor<T> & Partial<RequestPageContext>> & {
	staticPaths?: GetStaticPaths;
	staticProps?: GetStaticProps<T>;
	metadata?: GetMetadata<T>;
	resolveDependencies?: GetPageDependencies<T>;
	cache?: CacheStrategy;
	requires?: PageRequires;
	middleware?: FileRouteMiddleware[];
};

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
 * The options for the route renderer.
 */
export type RouteRendererOptions = {
	file: string;
	params?: PageParams;
	query?: PageQuery;
	locals?: RequestLocals;
	/**
	 * Preloaded page module from request-time inspection.
	 *
	 * @remarks
	 * When present, render preparation reuses this module instead of importing the
	 * page file again for the same request.
	 */
	pageModule?: EcoPageFile;
	/**
	 * Extra props merged into the page props for this render.
	 * @remarks Used by semantic error pages (for example development `message` /
	 * `stack` on the custom 500 page).
	 */
	props?: Record<string, unknown>;
	/**
	 * Skips the page's `staticProps` hook for this render.
	 * @remarks Set when the caller already holds the final props, as the caller of an
	 * explicit view does. `props` then replaces the hook's result instead of being
	 * merged into it, and metadata sees the same props.
	 */
	skipStaticProps?: boolean;
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
	/** Source paths observed during render preparation for HTML cache invalidation. */
	sourceDependencyPaths?: readonly string[];
	/** Page metadata the document was rendered with. */
	metadata?: PageMetadataProps;
};

export type PageClientPlanIslandEntry = {
	component: EcoComponent;
	file: string;
	integrationName: string;
};

export type PageClientPlan = {
	currentIntegrationName: string;
	integrationNames: Set<string>;
	lazyTriggers: ResolvedLazyTrigger[];
	lazyClientEntries: AssetDefinition[];
	lazyConfigs: EcoComponentConfig[];
	islandEntries: PageClientPlanIslandEntry[];
	sourceComponents: EcoComponent[];
};

export type PageClientBrowserAssets = {
	processedAssets: ProcessedAsset[];
	islandRenderAssetsByFile: Map<string, ProcessedAsset[]>;
	lazyTriggers: ResolvedLazyTrigger[];
};

export type PageClientBuildEntry = {
	dependency: AssetDefinition;
	islandFile?: string;
};

/**
 * The options for the integration renderer.
 */
export type IntegrationRendererRenderOptions<C = EcoPagesElement> = RouteRendererOptions & {
	props?: Record<string, unknown>;
	metadata: PageMetadataProps;
	HtmlTemplate: EcoHtmlComponent<C>;
	Page: EcoComponent<PageProps, C>;
	Layouts?: EcoComponent[];
	Layout?: EcoPageLayoutComponent<any>;
	layoutEntries?: EcoPageLayoutEntry[];
	dependencies?: EcoComponentDependencies;
	/** Components returned by the page's dependency resolver, available to Integration render hooks. */
	pageDependencyComponents?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	resolvedDependencies: ProcessedAsset[];
	pagePackage?: PagePackageResult;
	pageProps?: Record<string, unknown>;
	cacheStrategy?: CacheStrategy;
	pageLocals?: RequestLocals;
};

export type InternalIntegrationRendererRenderOptions<C = EcoPagesElement> = IntegrationRendererRenderOptions<C> & {
	sourceDependencyPaths?: readonly string[];
	pageClientPlan?: PageClientPlan;
	islandRenderAssetsByFile?: Map<string, ProcessedAsset[]>;
};

/**
 * Structured page asset package produced after dependency resolution.
 *
 * `assets` retains the full processed asset list, while the remaining fields
 * split that list into the subsets used during final HTML injection and
 * renderer-owned follow-up work.
 */
export interface PagePackageResult {
	/**
	 * Full processed asset list before any page-level partitioning.
	 */
	assets: ProcessedAsset[];
	/**
	 * Optional structured Page Browser Graph carried through route preparation.
	 */
	pageBrowserGraph?: PageBrowserGraphResult;
	/**
	 * Assets that should still be injected into the final HTML document.
	 */
	htmlAssets: ProcessedAsset[];
	/**
	 * Primary page-owned browser entry when one was identified during packaging.
	 */
	pageScript?: ProcessedAsset;
	/**
	 * Primary page-owned stylesheet when one was identified during packaging.
	 */
	pageStylesheet?: ProcessedAsset;
	/**
	 * Inline assets that remain embedded directly in the document.
	 */
	inlineAssets: ProcessedAsset[];
	/**
	 * Assets kept outside the main page package so callers can manage them explicitly.
	 */
	separateAssets: ProcessedAsset[];
	/**
	 * Browser chunks needed after initial page bootstrap, including eager lazy-entry bundles.
	 */
	dynamicChunks: ProcessedAsset[];
}

/**
 * Page-scoped browser output planned before final HTML packaging.
 *
 * This shape keeps page-browser ownership explicit without forcing downstream
 * HTML packaging to understand how integrations discovered the graph. Entry
 * assets represent the initial page bootstrap outputs, while chunk assets stay
 * separate so callers can preserve lazy/shared chunk identity until the point
 * they intentionally flatten for page packaging.
 */
export interface PageBrowserGraphResult {
	/**
	 * Processed assets needed for the initial page browser bootstrap.
	 */
	entryAssets: ProcessedAsset[];
	/**
	 * Processed browser chunks referenced after the initial page bootstrap.
	 */
	chunkAssets: ProcessedAsset[];
}

export type PageBrowserGraphContributionContext = {
	file: string;
	pageModule: EcoPageFile;
	props?: Record<string, unknown>;
	params?: PageParams;
	query?: PageQuery;
	dependencyInstanceKey?: string;
};

export interface PageBrowserGraphContribution {
	dependencies?: AssetDefinition[];
	assets?: ProcessedAsset[];
	/** Source files that should invalidate this graph entry when they change. */
	watchPaths?: string[];
}

type OwnershipValidationErrorCode = 'UNKNOWN_INTEGRATION_OWNER' | 'MISSING_COMPONENT_METADATA';

export interface OwnershipValidationError {
	code: OwnershipValidationErrorCode;
	message: string;
	componentId?: string;
	componentFile?: string;
	integrationName?: string;
}

export type OwnershipPlanNodeSource = 'route' | 'page' | 'layout' | 'html-template' | 'dependency';

/**
 * Shared execution-scoped context threaded through foreign-child renders.
 *
 * Integrations can extend this with renderer-local runtime keys, but the cache
 * and optional component instance identity are shared across all renderers.
 */
export interface BaseIntegrationContext {
	rendererCache?: Map<string, unknown>;
	componentInstanceId?: string;
}

/**
 * Shared input for renderer-owned component execution.
 *
 * @remarks
 * `children` stays `unknown` at this boundary so integrations can receive
 * queued tokens, already-serialized HTML, or framework-native values before
 * their own placement rules apply. Opaque values must be rejected or converted
 * by foreign-child interception before string serializers run; adapters keep
 * framework-specific placement (React raw HTML, Lit slot markers).
 */
export interface ComponentRenderInput<TIntegrationContext extends BaseIntegrationContext = BaseIntegrationContext> {
	component: EcoComponent;
	props: Record<string, unknown>;
	children?: unknown;
	integrationContext?: TIntegrationContext;
}

export interface ComponentRenderResult {
	html: string;
	canAttachAttributes: boolean;
	integrationName: string;
	rootAttributes?: Record<string, string>;
	assets?: ProcessedAsset[];
}

/**
 * Services available to API handlers.
 */
interface ApiHandlerServices {
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
 * Context for rendering views in route handlers.
 * Provides methods to render eco.page views and return formatted responses.
 */
export interface RenderContext {
	/**
	 * Import a server-executed module through the active Ecopages module loader.
	 *
	 * This applies the runtime's cache-busting and source-transpilation rules so
	 * request-time lazy imports participate in development invalidation.
	 *
	 * @param filePath - Absolute filesystem path or file URL for the server module
	 */
	importServerModule<T = unknown>(filePath: string | URL): Promise<T>;

	/**
	 * Import a server module through the active Ecopages module loader and render
	 * its default-exported eco.page view.
	 *
	 * @param filePath - Absolute filesystem path or file URL for the server module
	 * @param props - Props to pass to the default-exported view
	 * @param options - Optional status code and headers
	 */
	renderServerModule<P = Record<string, unknown>>(
		filePath: string | URL,
		props?: P,
		options?: RenderOptions,
	): Promise<Response>;

	/**
	 * Render an eco.page view with full layout and includes.
	 * @param view - The eco.page component to render
	 * @param props - Props to pass to the view
	 * @param options - Optional status code and headers
	 */
	render<P = Record<string, unknown>>(view: EcoComponent<P>, props?: P, options?: RenderOptions): Promise<Response>;

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
	json(data: unknown, options?: RenderOptions): Response;

	/**
	 * Return an HTML response.
	 * @param content - HTML string content
	 * @param options - Optional status code and headers
	 */
	html(content: string, options?: RenderOptions): Response;
}

/**
 * Context provided to the API handler.
 */
export interface ApiHandlerContext<TRequest extends Request = Request, TServer = any> extends RenderContext {
	request: TRequest;
	/** Dynamic segments are strings; catch-all segments are arrays of decoded path segments. */
	params: PageParams;
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
	 * Request body validated by `schema.body`.
	 *
	 * - Without `schema.body`: `undefined`
	 * - With `schema.body`: the validated body, typed from the schema
	 *
	 * For raw access to the request body stream, use `ctx.request.body`.
	 *
	 * @example With validation
	 * ```typescript
	 * import { z } from 'zod';
	 *
	 * app.post('/posts', async (ctx) => {
	 *   const { title, author } = ctx.body; // { title: string; author: string }
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
	 * - Without `schema.query`: query params as strings, or arrays when a key is repeated
	 * - With `schema.query`: the validated query, typed from the schema
	 *
	 * Repeated query keys are represented as arrays, matching `PageQuery` on page props.
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
	query: PageQuery;
	/**
	 * Request headers validated by `schema.headers`.
	 *
	 * - Without `schema.headers`: `undefined`
	 * - With `schema.headers`: the validated headers, typed from the schema
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
 * Context available to file-route page middleware.
 *
 * Page middleware can mutate locals, short-circuit the request, and use the
 * response helpers, but final document rendering stays owned by the page route
 * execution path. The query string is not parsed for page middleware; read it from `request.url`.
 */
export interface FileRouteMiddlewareContext<TRequest extends Request = Request, TServer = any> extends Omit<
	ApiHandlerContext<TRequest, TServer>,
	'render' | 'renderPartial' | 'importServerModule' | 'renderServerModule' | 'query'
> {}

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
 * type AuthContext = ApiHandlerContext<Request, unknown> & { user: User };
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
 * Middleware contract for file-based page routes.
 */
export type FileRouteMiddleware<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends FileRouteMiddlewareContext<TRequest, TServer> = FileRouteMiddlewareContext<TRequest, TServer>,
> = (context: TContext, next: MiddlewareNext) => Promise<Response> | Response;

/**
 * Helper type for defining middleware with extended context.
 * Automatically infers TRequest and TServer from the provided context type.
 *
 * @typeParam TContext - The extended context type that includes TRequest and TServer
 *
 * @example
 * ```typescript
 * type AuthContext = ApiHandlerContext<Request, unknown> & {
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
 * The request methods an `ApiHandler` answers, in the order an endpoint's `Allow` header lists them.
 */
export const API_HANDLER_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'QUERY'] as const;

export type ApiHandlerMethod = (typeof API_HANDLER_METHODS)[number];

/**
 * Represents an API handler in EcoPages.
 * Defines the path, method, handler function, optional middleware, and validation schemas.
 *
 * @example Basic handler
 * ```typescript
 * app.get('/users/:id', async (ctx) => {
 *   return ctx.json({ id: ctx.params.id });
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
	/**
	 * The URL pattern. `''` for a handler built without `path`, which an endpoint file exports;
	 * its Template Route gives the URL.
	 */
	path: TPath;
	method: ApiHandlerMethod;
	handler: (context: ApiHandlerContext<TRequest, TServer>) => Promise<Response> | Response;
	/** Optional middleware chain executed before the handler */
	middleware?: Middleware<TRequest, TServer, any>[];
	/** Optional validation schemas for request body, query parameters, and headers */
	schema?: {
		body?: StandardSchema;
		query?: StandardSchema;
		headers?: StandardSchema;
		params?: StandardSchema;
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
 *
 * @typeParam TMiddleware - The route's middleware; inferred as a tuple so the handler sees what each one adds
 * @typeParam TSchema - The route's schema; each field it declares types the matching context field
 */
export interface RouteOptions<
	TRequest extends Request = Request,
	TServer = any,
	TSchema extends RouteSchema = RouteSchema,
	TMiddleware extends MiddlewareList<TRequest, TServer> = MiddlewareList<TRequest, TServer>,
> {
	middleware?: TMiddleware;
	schema?: TSchema;
}

/**
 * A middleware list, whatever context each middleware declares.
 *
 * @remarks
 * Each element is a method signature, so its context parameter is checked bivariantly: a middleware typed with
 * the wider context it adds, such as `EcoMiddleware<AuthContext>`, still fits. An inline middleware function in
 * the list is typed with the base context, also inside a group; type it as `EcoMiddleware` to read what the
 * group middleware adds. A list holding an unannotated inline function is inferred only after the arguments before it, so a handler
 * written before the list (`app.get(path, handler, options)`, or `handler` before `middleware` in a define call)
 * sees none of the list's contexts. Put `middleware` first, or declare the inline function as a `Middleware` constant.
 */
export type MiddlewareList<TRequest extends Request = Request, TServer = any> = readonly {
	middleware(context: ApiHandlerContext<TRequest, TServer>, next: MiddlewareNext): Promise<Response> | Response;
}['middleware'][];

/**
 * The context a list of middleware adds: the intersection of the context each one declares.
 *
 * @remarks
 * Inferring one parameter from the union of the middleware types, a contravariant position, yields the
 * intersection of their contexts. An empty list adds nothing.
 */
export type MiddlewareContext<TMiddleware extends readonly unknown[]> = [TMiddleware[number]] extends [
	(context: infer TAdded, next: never) => unknown,
]
	? [TAdded] extends [never]
		? unknown
		: TAdded
	: unknown;

export interface RouteSchema {
	body?: StandardSchema;
	query?: StandardSchema;
	headers?: StandardSchema;
	params?: StandardSchema;
}

/**
 * The context a handler receives: the base or middleware context, with each field the schema declares
 * replaced by that schema's output.
 *
 * @remarks
 * A field the schema omits keeps the type it has on `TContext`, so a schema with only `body` still
 * gives `params` as {@link PageParams}. `params` is typed only by `TSchema['params']`; the route's
 * path string never narrows it.
 */
export type RouteHandlerContext<TSchema extends RouteSchema, TContext extends ApiHandlerContext<any, any>> = Omit<
	TContext,
	RouteSchemaField
> & {
	[K in RouteSchemaField]: TSchema[K] extends StandardSchema ? InferOutput<TSchema[K]> : TContext[K];
};

/**
 * @remarks
 * Mapping over this alias instead of `keyof RouteSchema` keeps the mapped type from copying the optional
 * modifiers of {@link RouteSchema}, so each field is required and an optional schema still types its
 * output with `undefined`.
 */
type RouteSchemaField = keyof RouteSchema;

/**
 * Registers an inline route: the handler is typed from the route's `schema` and from the context every
 * one of its `middleware` adds on top of `TContext`.
 *
 * @typeParam TReturn - What the call returns, for chaining
 * @typeParam TContext - The context the route starts from: the base context, or the group's
 *
 * @remarks
 * `TRouteContext` has no inference site; passing it explicitly types a context that the route's
 * middleware list does not declare.
 */
export type RouteMethod<
	TReturn,
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> = <
	TSchema extends RouteSchema = RouteSchema,
	TRouteContext extends TContext = TContext,
	const TMiddleware extends MiddlewareList<TRequest, TServer> = MiddlewareList<TRequest, TServer>,
>(
	path: string,
	handler: (
		context: RouteHandlerContext<TSchema, TRouteContext & MiddlewareContext<TMiddleware>>,
	) => Promise<Response> | Response,
	options?: RouteOptions<TRequest, TServer, TSchema, TMiddleware>,
) => TReturn;

/**
 * Builder for defining routes within a group, one method per HTTP method.
 * Provides chainable methods for registering routes with shared prefix and middleware.
 *
 * @typeParam TRequest - The request type
 * @typeParam TServer - The server type
 * @typeParam TContext - Extended context type from group middleware
 *
 * @remarks `query` registers the HTTP QUERY method, not a handler for `ctx.query`.
 */
export type RouteGroupBuilder<
	TRequest extends Request = Request,
	TServer = any,
	TContext extends ApiHandlerContext<TRequest, TServer> = ApiHandlerContext<TRequest, TServer>,
> = {
	[M in ApiHandler['method'] as Lowercase<M>]: RouteMethod<
		RouteGroupBuilder<TRequest, TServer, TContext>,
		TRequest,
		TServer,
		TContext
	>;
};

/**
 * A function that dynamically imports a view module.
 * Used by `app.static()` and the HTML error-page helpers (`app.notFound()`,
 * `app.forbidden()`, `app.serverError()`, `app.errorPage()`, …) to enable HMR
 * in development.
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

/**
 * Lazy view loaders registered through `app.errorPage()` and the named
 * `app.badRequest()` / `app.unauthorized()` / `app.forbidden()` /
 * `app.notFound()` / `app.conflict()` / `app.serverError()` helpers.
 */
export type ErrorPageLoaders = {
	badRequest?: ViewLoader<ErrorPageTemplateProps>;
	unauthorized?: ViewLoader<ErrorPageTemplateProps>;
	forbidden?: ViewLoader<ErrorPageTemplateProps>;
	notFound?: ViewLoader<ErrorPageTemplateProps>;
	conflict?: ViewLoader<ErrorPageTemplateProps>;
	serverError?: ViewLoader<ErrorPageTemplateProps>;
};
