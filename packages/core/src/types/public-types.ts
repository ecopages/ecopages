import type { Readable } from 'node:stream';
import type { ComponentIdentity } from '../eco/component-identity.ts';
import type { ApiResponseBuilder } from '../adapters/shared/http/api-response.ts';
import type { ForeignChildRuntime } from '../route-renderer/orchestration/foreign-child/component-render-context.ts';
import type { EcoPageComponent } from '../eco/eco.types.ts';
import type { EcoPagesAppConfig } from './internal-types.ts';
import type { HmrStrategy } from '../hmr/hmr-strategy.ts';
import type { AssetDefinition, ProcessedAsset } from '../services/assets/asset-processing-service/assets.types.ts';
import type { CacheStats, CacheStrategy } from '../services/cache/cache.types.ts';
import type { InteractionEventsString as ScriptsInjectorInteractionEventsString } from '@ecopages/scripts-injector/types';
import type { EntrypointDependencyGraph } from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import type { DevTransformBundleContributor } from '../dev/transform-server/types.ts';

export type { EcoPagesAppConfig } from './internal-types.ts';
export type {
	EcoPageComponent,
	GetPageDependencies,
	GetPageDependenciesContext,
	PageDependenciesResult,
} from '../eco/eco.types.ts';
export type { ProcessedAsset } from '../services/assets/asset-processing-service/assets.types.ts';

/**
 * Runtime-agnostic incoming WebSocket frame.
 *
 * Both Bun and Node `ws` deliver text and binary frames; this discriminated
 * union lets handlers deal with both without runtime-specific casts.
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
export interface WebSocketContextFactoryInput<TParams extends Record<string, string> = Record<string, string>> {
	readonly request: Request;
	readonly kind: string;
	readonly params: TParams;
	readonly search: Readonly<Record<string, string>>;
	readonly locals?: RequestLocals;
}

/**
 * Runtime-agnostic WebSocket socket view exposed to handlers.
 *
 * Framework-owned fields:
 * - `kind`: the registered route pattern (e.g. '/ws/chat/:roomId')
 * - `params`: dynamic segments captured at match time
 * - `search`: query string, always string-typed
 *
 * App-owned field:
 * - `context`: returned by the handler's `context()` factory
 */
export interface EcopagesSocket<TContext = unknown, TParams extends Record<string, string> = Record<string, string>> {
	readonly kind: string;
	readonly params: TParams;
	readonly search: Readonly<Record<string, string>>;
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
import type {
	StandardSchema,
	StandardSchemaResult,
	StandardSchemaSuccessResult,
	StandardSchemaFailureResult,
	StandardSchemaIssue,
	InferOutput,
	StandardSchemaV1,
} from '../services/validation/standard-schema.types.ts';

export type {
	StandardSchema,
	StandardSchemaResult,
	StandardSchemaSuccessResult,
	StandardSchemaFailureResult,
	StandardSchemaIssue,
	InferOutput,
	StandardSchemaV1,
	ForeignChildRuntime,
};

export type InteractionEventsString = ScriptsInjectorInteractionEventsString;

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

export type ResolvedLazyScriptGroup = {
	lazy: DependencyLazyTrigger;
	scripts: string;
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
	getEntrypointDependencyGraph(): EntrypointDependencyGraph;
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
	/**
	 * Page Browser Graph identities invalidated by the originating file change.
	 */
	graphIdentities?: Array<{
		integrationName: string;
		routeFile: string;
		policy: 'development' | 'production';
		entryFingerprint: string;
	}>;
};

/**
 * Options for handling a development file change through HMR.
 */
export type HmrFileChangeOptions = {
	broadcast?: boolean;
	graphIdentities?: ClientBridgeEvent['graphIdentities'];
};

/**
 * Adapter-agnostic interface for broadcasting development events to connected clients.
 * Implemented by both the Bun and Node client bridges.
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

	/**
	 * Registers a custom HMR strategy.
	 */
	registerStrategy(strategy: HmrStrategy): void;

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
	 * Gets the output URL for a registered entrypoint.
	 */
	getOutputUrl(entrypointPath: string): string | undefined;

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
	 * Gets the on-disk work directory for the bundled HMR client runtime.
	 */
	getRuntimeWorkDir(): string;

	/**
	 * Returns the on-disk path to the bundled HMR runtime script.
	 */
	getRuntimePath(): string;

	/**
	 * Serves a development HMR asset request when the URL matches a known HMR path.
	 */
	tryHandleAssetRequest(request: Request): Response | null;

	/**
	 * Gets the default HMR context.
	 */
	getDefaultContext(): DefaultHmrContext;

	/**
	 * Handles a file change event.
	 */
	handleFileChange(path: string, options?: HmrFileChangeOptions): Promise<void>;
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
	 * with plugin-injected `config.identity` metadata.
	 */
	components?: EcoDeclaredComponent[];
};

/**
 * Component returned from `eco.component()`, `eco.layout()`, or `eco.html()`.
 *
 * @remarks
 * Used for `dependencies.components` and eco factory return types. Plugin-injected
 * `config.identity` is enforced at runtime via `isEcoDeclaredComponent()`, not by this alias.
 */
export type EcoDeclaredComponent<P = any, R = any> = EcoComponent<P, R>;

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

/**
 * Represents the input configuration for EcoPages.
 */
export type EcoPagesConfig = Omit<
	Partial<EcoPagesAppConfig>,
	'baseUrl' | 'derivedPaths' | 'templatesExt' | 'integrationsDependencies'
> &
	Pick<EcoPagesAppConfig, 'baseUrl' | 'rootDir'>;

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
	layouts?: EcoDeclaredComponent[];
	/** Layout entries retained for per-tier prop factories. */
	layoutEntries?: EcoPageLayoutEntry[];
	dependencies?: EcoComponentDependencies;
	/**
	 * Internal: Resolved lazy scripts grouped by trigger.
	 * Set by the renderer, used by eco.component() for multi-trigger auto-wrapping.
	 * @internal
	 */
	_resolvedLazyScripts?: ResolvedLazyScriptGroup[];
	/**
	 * Internal: Resolved lazy triggers for the global injector map.
	 * Set by the renderer in the default full orchestration flow.
	 * @internal
	 */
	_resolvedLazyTriggers?: ResolvedLazyTrigger[];
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
 * Disabled by default. When enabled, the sitemap is written after
 * `afterStaticExport` so integration-generated URLs can be listed via
 * `extraUrls`. Use `exclude` for bulk pathname filters and `metadata.robots.index: false`
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
	/** Route params for dynamic routes (empty for static routes). */
	params: Record<string, string>;
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
	params?: Record<string, string>;
	query?: Record<string, string>;
	locals?: RequestLocals;
};

/**
 * One layout tier in a page layout stack (outer→inner).
 */
export type EcoPageLayoutEntry<E = EcoPagesElement> = {
	component: EcoDeclaredComponent<any, E>;
	props?: (context: LayoutPropsContext) => Record<string, unknown>;
};

/**
 * Layout declaration accepted by `eco.page()`.
 *
 * @remarks
 * Array order is outer→inner, matching Next.js App Router segment nesting.
 */
export type EcoPageLayoutSpec<E = EcoPagesElement> = EcoDeclaredComponent<any, E> | EcoPageLayoutEntry<E>;

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
export type EcoPageLayoutComponent<T = EcoPagesElement> = EcoLayoutComponent<T> | EcoComponent<any, T>;

/**
 * Represents a layout component created with eco.layout().
 */
export type EcoLayoutComponent<T = EcoPagesElement> = EcoComponent<LayoutProps<T>, T>;

/**
 * Represents an HTML shell component created with eco.html().
 */
export type EcoHtmlComponent<T = EcoPagesElement> = EcoComponent<HtmlTemplateProps, T>;

/**
 * Props type for the semantic `404.*` page template.
 * @remarks `message` and `stack` are declared for future error context. The
 * runtime does not currently pass these props when rendering the custom 404 page.
 */
export interface Error404TemplateProps extends Omit<HtmlTemplateProps, 'children'> {
	message: string;
	stack?: string;
}

/**
 * Props type for the semantic `500.*` page template.
 * @remarks In development, the page-pipeline passes `message` and `stack` from the
 * thrown error when rendering this page after a failure. In production those
 * fields are omitted so stacks are not serialized into HTML. Direct visits to
 * `/500` also omit them.
 */
export interface Error500TemplateProps extends Omit<HtmlTemplateProps, 'children'> {
	message?: string;
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
	/**
	 * Extra props merged into the page props for this render.
	 * @remarks Used by semantic error pages (for example development `message` /
	 * `stack` on the custom 500 page).
	 */
	props?: Record<string, unknown>;
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
	HtmlTemplate: EcoHtmlComponent<C>;
	Page: EcoComponent<PageProps, C>;
	Layouts?: EcoDeclaredComponent[];
	Layout?: EcoPageLayoutComponent<any>;
	layoutEntries?: EcoPageLayoutEntry[];
	dependencies?: EcoComponentDependencies;
	/** @internal Resolved page dependencies carried through the render pipeline. */
	resolvedPageDependencyComponents?: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	resolvedDependencies: ProcessedAsset[];
	pagePackage?: PagePackageResult;
	pageProps?: Record<string, unknown>;
	cacheStrategy?: CacheStrategy;
	pageLocals?: RequestLocals;
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

export type OwnershipValidationErrorCode = 'UNKNOWN_INTEGRATION_OWNER' | 'MISSING_COMPONENT_METADATA';

export interface OwnershipValidationError {
	code: OwnershipValidationErrorCode;
	message: string;
	componentId?: string;
	componentFile?: string;
	integrationName?: string;
}

export type OwnershipPlanNodeSource = 'route' | 'page' | 'layout' | 'html-template' | 'dependency';

export type ForeignSubtreeAttachmentPolicy = { kind: 'none' } | { kind: 'first-element' };

export interface ForeignSubtreeRenderPayload {
	html: string;
	assets: ProcessedAsset[];
	rootTag?: string;
	rootAttributes?: Record<string, string>;
	attachmentPolicy: ForeignSubtreeAttachmentPolicy;
	integrationName: string;
}

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
	rootTag?: string;
	integrationName: string;
	rootAttributes?: Record<string, string>;
	assets?: ProcessedAsset[];
}

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
	params: Record<string, string>;
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
 * Context available to file-route page middleware.
 *
 * Page middleware can mutate locals, short-circuit the request, and use the
 * response helpers, but final document rendering stays owned by the page route
 * execution path.
 */
export interface FileRouteMiddlewareContext<TRequest extends Request = Request, TServer = any> extends Omit<
	ApiHandlerContext<TRequest, TServer>,
	'render' | 'renderPartial' | 'importServerModule' | 'renderServerModule'
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
	params?: StandardSchema;
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
	params: InferSchemaOutput<TSchema['params']>;
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
export type TypedGroupHandlerContext<TSchema extends RouteSchema, TContext extends ApiHandlerContext<any, any>> = Omit<
	TContext,
	'body' | 'query' | 'headers' | 'params'
> & {
	body: InferSchemaOutput<TSchema['body']>;
	query: InferSchemaOutput<TSchema['query']>;
	headers: InferSchemaOutput<TSchema['headers']>;
	params: InferSchemaOutput<TSchema['params']>;
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
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	post<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	put<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	delete<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	patch<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	options<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
		options?: RouteOptions<TRequest, TServer, TContext> & { schema?: TSchema },
	): RouteGroupBuilder<TRequest, TServer, TContext>;

	head<P extends string, TSchema extends RouteSchema = RouteSchema>(
		path: P,
		handler: (context: TypedGroupHandlerContext<TSchema, TContext>) => Promise<Response> | Response,
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
