import type {
	EcoComponent,
	EcoHtmlComponent,
	LayoutProps,
	EcoPagesElement,
	EcoPageComponent,
	FileRouteMiddleware,
	RequestPageContext,
} from '../types/contracts.ts';
import type { CacheStrategy } from '../page-cache/cache.types.ts';
import type {
	ComponentOptions,
	Eco,
	HtmlOptions,
	LayoutOptions,
	PageOptionsBase,
	PagePropsFor,
} from '../types/eco-api-types.ts';
import { applyPageLayoutConfig, mergeLayoutDependencies, normalizePageLayouts } from './page-layout-normalization.ts';

/**
 * Creates a browser component that renders inline for every caller.
 *
 * @remarks
 * A Component another Integration owns still renders its own result here. The React integration gives its own
 * modules a boundary for such a Component when it builds them, so the factory does not know which Integration
 * calls it.
 */
function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const component = ((props: P) => options.render(props)) as EcoComponent<P, E>;

	component.config = {
		identity: options.identity,
		integration: options.integration,
		dependencies: options.dependencies,
	};

	return component;
}

function component<P = {}, E = EcoPagesElement>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	return createComponentFactory(options);
}

type CallableEcoComponent<P = Record<string, unknown>, R = unknown> = (props: P, ...args: any[]) => R;

function embed<P, R>(component: CallableEcoComponent<P, R>, props: P): R;
function embed<P extends Record<string, unknown>, R>(
	component: CallableEcoComponent<P, R>,
	props: P,
	children: unknown,
): R;

function embed<P extends Record<string, unknown>, R>(
	component: CallableEcoComponent<P, R>,
	props: P,
	children?: unknown,
): R {
	const nextProps = (children === undefined ? props : { ...props, children }) as P;
	return component(nextProps);
}

function html<E = EcoPagesElement>(options: HtmlOptions<E>): EcoHtmlComponent<E> {
	return createComponentFactory(options) as EcoHtmlComponent<E>;
}

function layout<E = EcoPagesElement, P extends LayoutProps<E> = LayoutProps<E>>(
	options: LayoutOptions<E, P>,
): EcoComponent<P, E> {
	return createComponentFactory(options);
}

function page<T, E>(
	options: PageOptionsBase<T, E> & { cache?: CacheStrategy; middleware?: FileRouteMiddleware[] },
): EcoPageComponent<T> {
	const {
		layout: pageLayout,
		dependencies: dependenciesInput,
		render,
		paths,
		props,
		metadata,
		cache,
		requires,
		middleware,
	} = options;

	const layoutEntries = normalizePageLayouts(pageLayout);
	const resolveDependencies = typeof dependenciesInput === 'function' ? dependenciesInput : undefined;
	const staticDependencies =
		typeof dependenciesInput === 'function'
			? mergeLayoutDependencies(undefined, layoutEntries)
			: mergeLayoutDependencies(dependenciesInput, layoutEntries);

	const pageComponent = createComponentFactory({
		identity: options.identity,
		integration: options.integration,
		dependencies: staticDependencies,
		render,
	} as ComponentOptions<PagePropsFor<T> & Partial<RequestPageContext>, E>) as EcoPageComponent<T>;

	if (pageComponent.config) {
		applyPageLayoutConfig(pageComponent.config, layoutEntries);
	}

	if (paths) {
		pageComponent.paths = paths;
	}

	if (props) {
		pageComponent.props = props;
	}

	if (metadata) {
		pageComponent.metadata = metadata;
	}

	if (resolveDependencies) {
		pageComponent.resolveDependencies = resolveDependencies;
	}

	if (cache) {
		pageComponent.cache = cache;
	}

	if (requires) {
		pageComponent.requires = requires;
	}

	if (middleware) {
		pageComponent.middleware = middleware;
	}

	return pageComponent;
}

export const eco: Eco = {
	component,
	embed,
	html,
	layout,
	page,
};
