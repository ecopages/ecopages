/**
 * The eco namespace - unified component and page factory API
 * @module
 */

import type { EcoComponent, GetMetadata, GetStaticPaths, GetStaticProps } from '../public-types.ts';
import type { ComponentOptions, Eco, LazyTrigger, PageOptions, PagePropsFor } from './eco.types.ts';

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
		throw new Error('Invalid lazy options: must specify on:idle, on:interaction, or on:visible');
	}

	return `${triggerAttr} scripts="${scripts}"`;
}

/**
 * Creates a component factory that auto-wraps lazy dependencies
 */
function createComponentFactory<P>(options: ComponentOptions<P>): EcoComponent<P> {
	const lazy = options.dependencies?.lazy;

	const component: EcoComponent<P> = ((props: P) => {
		const content = options.render(props);

		/**
		 * Auto-wrap with scripts-injector if lazy dependencies exist
		 */
		if (lazy && component.config?._resolvedScripts) {
			const attrs = buildInjectorAttrs(lazy, component.config._resolvedScripts);
			return `<scripts-injector ${attrs}>${content}</scripts-injector>`;
		}

		return content;
	}) as EcoComponent<P>;

	component.config = {
		componentDir: options.componentDir,
		dependencies: options.dependencies,
	};

	return component;
}

/**
 * The eco namespace - provides factories for components and pages
 */
export const eco: Eco = {
	/**
	 * Create a reusable component with dependencies and optional lazy-loading
	 */
	component<P = {}>(options: ComponentOptions<P>): EcoComponent<P> {
		return createComponentFactory(options);
	},

	/**
	 * Create a page component with type-safe props from getStaticProps
	 */
	page<T = {}>(options: PageOptions<T>): EcoComponent<PagePropsFor<T>> {
		const { layout, dependencies, render } = options;

		// If layout is specified, wrap content and add layout to components
		if (layout) {
			const wrappedRender = (props: PagePropsFor<T>) => {
				const content = render(props);
				return layout({ children: content });
			};

			const wrappedOptions: ComponentOptions<PagePropsFor<T>> = {
				componentDir: options.componentDir,
				dependencies: {
					...dependencies,
					components: [...(dependencies?.components || []), layout],
				},
				render: wrappedRender,
			};

			return createComponentFactory(wrappedOptions);
		}

		return createComponentFactory(options) as EcoComponent<PagePropsFor<T>>;
	},

	/**
	 * Type-safe wrapper for page metadata (identity function)
	 */
	metadata<P = {}>(fn: GetMetadata<P>): GetMetadata<P> {
		return fn;
	},

	/**
	 * Type-safe wrapper for static paths (identity function)
	 */
	staticPaths(fn: GetStaticPaths): GetStaticPaths {
		return fn;
	},

	/**
	 * Type-safe wrapper for static props (identity function)
	 */
	staticProps<P>(fn: GetStaticProps<P>): GetStaticProps<P> {
		return fn;
	},
};
