import type {
	DynamicEcoPageComponent,
	DynamicPageStatics,
	EcoComponent,
	EcoPageComponent,
	NoRouteProps,
	PagePropsFor,
	StaticPageStatics,
} from '../types/contracts.ts';
import type { DynamicPageOptions, PageOptions, StaticPageOptions } from '../types/eco-api-types.ts';

/**
 * Adds the options `eco.page()` keeps on the Page to its rendered component.
 *
 * @remarks
 * The `props` and dependency hooks are kept by Cache Strategy, so the result is the matching member of
 * {@link EcoPageComponent}: a Dynamic Page's hooks take the request context, any other Page's the build context.
 */
export function attachPageOptions<T, E>(
	component: EcoComponent<PagePropsFor<T>>,
	options: PageOptions<T, E>,
): EcoPageComponent<T> {
	const statics = options.cache === 'dynamic' ? createDynamicStatics(options) : createStaticStatics(options);
	if (options.paths) statics.paths = options.paths;
	if (options.metadata) statics.metadata = options.metadata;
	if (options.middleware) statics.middleware = options.middleware;
	return Object.assign(component, statics);
}

function createDynamicStatics<T, E>(options: DynamicPageOptions<T, E>): DynamicPageStatics<T> {
	const statics: DynamicPageStatics<T> = { cache: 'dynamic' };
	if (options.props) statics.props = options.props;
	if (typeof options.dependencies === 'function') statics.resolveDependencies = options.dependencies;
	return statics;
}

function createStaticStatics<T, E>(options: StaticPageOptions<T, E>): StaticPageStatics<T> {
	const statics: StaticPageStatics<T> = {};
	if (options.cache) statics.cache = options.cache;
	if (options.props) statics.props = options.props;
	if (typeof options.dependencies === 'function') statics.resolveDependencies = options.dependencies;
	return statics;
}

/**
 * Whether a loaded Page declares `cache: 'dynamic'`, read from an untyped module export or a typed Page.
 *
 * @remarks
 * It narrows to the Dynamic Page member of {@link EcoPageComponent}, so code that holds a loaded module calls it
 * instead of reading `cache` itself.
 */
export function isDynamicPage(page: unknown): page is DynamicEcoPageComponent<any> {
	return typeof page === 'function' && 'cache' in page && page.cache === 'dynamic';
}

/** The keys of {@link NoRouteProps}, listed once so the type and this check cannot drift apart. */
const ROUTE_PROPS: Record<keyof NoRouteProps, true> = { params: true, query: true };

/**
 * Throws when a Page's `props` hook returned a key that {@link NoRouteProps} bars.
 *
 * @remarks
 * The hook's type rejects those keys; this catches a hook whose types do not, such as one that returns `any` or a
 * Page written in JavaScript. A `null` or `undefined` result passes, and so does a barred key set to `undefined`, which
 * the type allows and the route overwrites.
 */
export function assertNoRouteProps(props: unknown, source: string): void {
	if (typeof props !== 'object' || props === null) return;
	for (const key of Object.keys(ROUTE_PROPS)) {
		if (Object.hasOwn(props, key) && Reflect.get(props, key) !== undefined) {
			throw new Error(
				`[ecopages] The props hook of ${source} returned "${key}", a key render receives from the route. Rename the prop.`,
			);
		}
	}
}
