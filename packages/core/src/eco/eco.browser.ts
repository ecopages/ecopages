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
import { getComponentOwner } from './component-identity.ts';

/**
 * Creates a browser component that renders inline, or through the registered Foreign Child host when another
 * Integration owns it.
 *
 * @remarks
 * The host is read from `window.__ECO_PAGES__` on every call, not imported, because the bootstrap that registers it
 * and the modules that declare components are separate bundles in development. A Foreign Child was server-rendered
 * by its own Integration, so its `render` never runs under a host: under React it would return output React cannot
 * render, such as a Lit `TemplateResult`.
 */
function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const owner = getComponentOwner(options);
	const component = ((props: P) => {
		const host = typeof window === 'undefined' ? undefined : window.__ECO_PAGES__?.foreignChildHost;
		if (host && owner && owner !== host.integration) {
			return host.renderForeignChild(component, (props ?? {}) as Record<string, unknown>);
		}
		return options.render(props);
	}) as EcoComponent<P, E>;

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
		identity: options.identity,
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

export const eco: Eco = {
	component,
	embed,
	html,
	layout,
	page,
};
