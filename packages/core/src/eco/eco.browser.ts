import type {
	EcoComponent,
	EcoHtmlComponent,
	LayoutProps,
	EcoPagesElement,
	EcoPageComponent,
} from '../types/contracts.ts';
import type {
	ComponentOptions,
	Eco,
	HtmlOptions,
	LayoutOptions,
	PageOptions,
	PagePropsFor,
} from '../types/eco-api-types.ts';
import { applyPageLayoutConfig, mergeLayoutDependencies, normalizePageLayouts } from './page-layout-normalization.ts';
import { attachPageOptions } from './page-data-hooks.ts';

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

function page<T, E>(options: PageOptions<T, E>): EcoPageComponent<T> {
	const { layout: pageLayout, dependencies: dependenciesInput, render } = options;

	const layoutEntries = normalizePageLayouts(pageLayout);
	const staticDependencies =
		typeof dependenciesInput === 'function'
			? mergeLayoutDependencies(undefined, layoutEntries)
			: mergeLayoutDependencies(dependenciesInput, layoutEntries);

	const componentOptions: ComponentOptions<PagePropsFor<T>, E> = {
		identity: options.identity,
		integration: options.integration,
		dependencies: staticDependencies,
		render,
	};
	const pageComponent = createComponentFactory(componentOptions);

	if (pageComponent.config) {
		applyPageLayoutConfig(pageComponent.config, layoutEntries);
	}

	return attachPageOptions(pageComponent, options);
}

export const eco: Eco = {
	component,
	embed,
	html,
	layout,
	page,
};
