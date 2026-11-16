import type {
	DynamicEcoPageComponent,
	DynamicPageStatics,
	EcoComponent,
	EcoPageComponent,
	PagePropsFor,
	RequestPageContext,
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
	component: EcoComponent<PagePropsFor<T> & Partial<RequestPageContext>>,
	options: PageOptions<T, E>,
): EcoPageComponent<T> {
	const statics = options.cache === 'dynamic' ? createDynamicStatics(options) : createStaticStatics(options);
	if (options.paths) statics.paths = options.paths;
	if (options.metadata) statics.metadata = options.metadata;
	if (options.requires) statics.requires = options.requires;
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
