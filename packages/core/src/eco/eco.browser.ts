import type {
	EcoComponent,
	EcoHtmlComponent,
	EcoLayoutComponent,
	EcoPagesElement,
	EcoPageComponent,
	FileRouteMiddleware,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
	RequestPageContext,
} from '../types/public-types.ts';
import type { CacheStrategy } from '../services/cache/cache.types.ts';
import type { ComponentOptions, Eco, HtmlOptions, LayoutOptions, PageOptionsBase, PagePropsFor } from './eco.types.ts';
import { applyPageLayoutConfig, mergeLayoutDependencies, normalizePageLayouts } from './page-layout-normalization.ts';
import { componentIdentityFromMeta } from './component-identity.ts';

function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const component = ((props: P) => options.render(props)) as EcoComponent<P, E>;

	component.config = {
		identity: componentIdentityFromMeta(options.__eco),
		__eco: options.__eco,
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

function layout<E = EcoPagesElement>(options: LayoutOptions<E>): EcoLayoutComponent<E> {
	return createComponentFactory(options) as EcoLayoutComponent<E>;
}

function page<T, E>(
	options: PageOptionsBase<T, E> & { cache?: CacheStrategy; middleware?: FileRouteMiddleware[] },
): EcoPageComponent<T> {
	const {
		layout: pageLayout,
		dependencies: dependenciesInput,
		render,
		staticPaths,
		staticProps,
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
		__eco: options.__eco,
		integration: options.integration,
		dependencies: staticDependencies,
		render,
	} as ComponentOptions<PagePropsFor<T> & Partial<RequestPageContext>, E>) as EcoPageComponent<T>;

	if (pageComponent.config) {
		applyPageLayoutConfig(pageComponent.config, layoutEntries);
	}

	if (staticPaths) {
		pageComponent.staticPaths = staticPaths;
	}

	if (staticProps) {
		pageComponent.staticProps = staticProps;
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

function metadata<T = Record<string, unknown>>(fn: GetMetadata<T>): GetMetadata<T> {
	return fn;
}

function staticPaths(fn: GetStaticPaths): GetStaticPaths {
	return fn;
}

function staticProps<P>(fn: GetStaticProps<P>): GetStaticProps<P> {
	return fn;
}

export const eco: Eco = {
	component,
	embed,
	html,
	layout,
	page,
	metadata,
	staticPaths,
	staticProps,
};
