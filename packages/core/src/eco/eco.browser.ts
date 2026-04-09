import type {
	EcoComponent,
	EcoHtmlComponent,
	EcoLayoutComponent,
	EcoPagesElement,
	EcoPageComponent,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
	Middleware,
	RequestPageContext,
} from '../types/public-types.ts';
import type { CacheStrategy } from '../services/cache/cache.types.ts';
import type { ComponentOptions, Eco, HtmlOptions, LayoutOptions, PageOptionsBase, PagePropsFor } from './eco.types.ts';

function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const component = ((props: P) => options.render(props)) as EcoComponent<P, E>;

	component.config = {
		__eco: options.__eco,
		integration: options.integration,
		dependencies: options.dependencies,
	};

	return component;
}

function component<P = {}, E = EcoPagesElement>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	return createComponentFactory(options);
}

function html<E = EcoPagesElement>(options: HtmlOptions<E>): EcoHtmlComponent<E> {
	return createComponentFactory(options) as EcoHtmlComponent<E>;
}

function layout<E = EcoPagesElement>(options: LayoutOptions<E>): EcoLayoutComponent<E> {
	return createComponentFactory(options) as EcoLayoutComponent<E>;
}

function page<T, E>(
	options: PageOptionsBase<T, E> & { cache?: CacheStrategy; middleware?: Middleware[] },
): EcoPageComponent<T> {
	const {
		layout: pageLayout,
		dependencies,
		render,
		staticPaths,
		staticProps,
		metadata,
		cache,
		requires,
		middleware,
	} = options;

	const pageComponent = createComponentFactory({
		__eco: options.__eco,
		integration: options.integration,
		dependencies: pageLayout
			? {
					...dependencies,
					components: [...(dependencies?.components ?? []), pageLayout],
				}
			: dependencies,
		render,
	} as ComponentOptions<PagePropsFor<T> & Partial<RequestPageContext>, E>) as EcoPageComponent<T>;

	if (pageLayout && pageComponent.config) {
		pageComponent.config.layout = pageLayout;
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
	html,
	layout,
	page,
	metadata,
	staticPaths,
	staticProps,
};
