/**
 * The eco namespace - unified component and page factory API
 * @module
 */

import type { EcoComponent, EcoPagesElement, GetMetadata, GetStaticPaths, GetStaticProps } from '../public-types.ts';
import type { ComponentOptions, Eco, EcoPageComponent, LazyTrigger, PageOptions, PagePropsFor } from './eco.types.ts';

/**
 * Builds scripts-injector HTML attributes from lazy config
 */
function buildInjectorAttrs(lazy: LazyTrigger, scripts: string): string {
	let triggerAttr: string;

	if ('on:idle' in lazy) {
		triggerAttr = 'on:idle';
	} else if ('on:interaction' in lazy) {
		triggerAttr = `on:interaction="${lazy['on:interaction']}"`;
	} else if ('on:visible' in lazy) {
		const value = lazy['on:visible'];
		triggerAttr = value === true ? 'on:visible' : `on:visible="${value}"`;
	} else {
		throw new Error(
			`Invalid lazy options: must specify on:idle, on:interaction, or on:visible. Received: ${JSON.stringify(lazy)}`,
		);
	}

	return `${triggerAttr} scripts="${scripts}"`;
}

function isPromise<T>(value: unknown): value is Promise<T> {
	return value != null && typeof (value as Promise<T>).then === 'function';
}

/**
 * Creates a component factory that auto-wraps lazy dependencies
 */
function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const lazy = options.dependencies?.lazy;

	const comp: EcoComponent<P, E> = ((props: P) => {
		const content = options.render(props);

		/**
		 * Auto-wrap with scripts-injector if lazy dependencies exist
		 */
		if (lazy && comp.config?._resolvedScripts) {
			const attrs = buildInjectorAttrs(lazy, comp.config._resolvedScripts);
			return `<scripts-injector ${attrs}>${content}</scripts-injector>`;
		}

		return content;
	}) as EcoComponent<P, E>;

	comp.config = {
		componentDir: options.componentDir,
		dependencies: options.dependencies,
	};

	return comp;
}

/**
 * Create a reusable component with dependencies and optional lazy-loading
 */
function component<P = {}, E = EcoPagesElement>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	return createComponentFactory(options);
}

/**
 * Create a page component with type-safe props from getStaticProps
 */
function page<T = {}, E = EcoPagesElement>(options: PageOptions<T, E>): EcoPageComponent<T> {
	const { layout, dependencies, render, staticPaths, staticProps, metadata } = options;

	let pageComponent: EcoPageComponent<T>;

	if (layout) {
		const wrappedRender = (props: PagePropsFor<T>): E | Promise<E> => {
			const content = render(props);
			if (isPromise<E>(content)) {
				return content.then((c) => layout({ children: c })) as Promise<E>;
			}
			const result = layout({ children: content });
			return result as E | Promise<E>;
		};

		const wrappedOptions: ComponentOptions<PagePropsFor<T>, E | Promise<E>> = {
			componentDir: options.componentDir,
			dependencies: {
				...dependencies,
				components: [...(dependencies?.components || []), layout],
			},
			render: wrappedRender,
		};

		pageComponent = createComponentFactory(wrappedOptions) as EcoPageComponent<T>;
	} else {
		pageComponent = createComponentFactory(options as ComponentOptions<PagePropsFor<T>, E>) as EcoPageComponent<T>;
	}

	if (staticPaths) pageComponent.staticPaths = staticPaths;
	if (staticProps) pageComponent.staticProps = staticProps;
	if (metadata) pageComponent.metadata = metadata;

	return pageComponent;
}

/**
 * Type-safe wrapper for page metadata (identity function)
 */
function metadata<P = {}>(fn: GetMetadata<P>): GetMetadata<P> {
	return fn;
}

/**
 * Type-safe wrapper for static paths (identity function)
 */
function staticPaths(fn: GetStaticPaths): GetStaticPaths {
	return fn;
}

/**
 * Type-safe wrapper for static props (identity function)
 */
function staticProps<P>(fn: GetStaticProps<P>): GetStaticProps<P> {
	return fn;
}

/**
 * The eco namespace - provides factories for components and pages
 */
export const eco: Eco = {
	component,
	page,
	metadata,
	staticPaths,
	staticProps,
};
