import { createElement, type FunctionComponent, type ReactElement } from 'react';
import type {
	EcoComponent,
	EcoDeclaredComponent,
	EcoPageLayoutEntry,
	LayoutPropsContext,
	RequestLocals,
} from '@ecopages/core';
import type { EcoComponentConfig } from '@ecopages/core';

export type LayoutComposeContext = LayoutPropsContext;

export type LayoutShellEntry = {
	component: EcoComponent;
	props?: Record<string, unknown>;
};

export type ComposablePage<P extends Record<string, unknown> = Record<string, unknown>> = FunctionComponent<P> & {
	config?: Pick<EcoComponentConfig, 'layout' | 'layouts' | 'layoutEntries'>;
};

/**
 * @remarks
 * Eco components are wider than React's `createElement` input; runtime checks narrow callables.
 */
function toReactComponent(component: EcoComponent): FunctionComponent<Record<string, unknown>> {
	if (typeof component !== 'function') {
		throw new TypeError('[ecopages] Expected a function component for layout composition.');
	}

	return component as FunctionComponent<Record<string, unknown>>;
}

/**
 * Reads request-scoped layout context from serialized page props.
 */
export function resolveLayoutContext(pageProps: Record<string, unknown>): LayoutComposeContext {
	const context: LayoutComposeContext = {};
	if (pageProps.params !== undefined) {
		context.params = pageProps.params as Record<string, string>;
	}
	if (pageProps.query !== undefined) {
		context.query = pageProps.query as Record<string, string>;
	}
	if (pageProps.locals !== undefined) {
		context.locals = pageProps.locals as RequestLocals;
	}
	return context;
}

/**
 * Resolves props for one layout entry, merging shell locals with an optional factory.
 */
export function resolveLayoutEntryProps(
	entry: EcoPageLayoutEntry,
	context: LayoutComposeContext,
): Record<string, unknown> {
	const shellProps = context.locals ? { locals: context.locals } : {};
	if (!entry.props) {
		return shellProps;
	}

	return {
		...shellProps,
		...entry.props(context),
	};
}

/**
 * @remarks
 * Eco page components are wider than React layout composition input; runtime checks narrow callables.
 */
export function assertComposablePage(Page: unknown): ComposablePage {
	if (typeof Page !== 'function') {
		throw new TypeError('[ecopages] Expected a function page component for layout composition.');
	}

	return Page as ComposablePage;
}

/**
 * Builds the client or SSR React tree for a page and its outer→inner layout stack.
 */
export function composeLayoutPageTree<P extends Record<string, unknown>>(
	Page: ComposablePage<P>,
	pageProps: P,
	options?: { context?: LayoutComposeContext },
): ReactElement {
	const context = options?.context ?? resolveLayoutContext(pageProps);
	const pageElement = createElement(Page, pageProps);
	const layoutEntries = Page.config?.layoutEntries;

	if (layoutEntries && layoutEntries.length > 0) {
		return [...layoutEntries].reverse().reduce<ReactElement>((children, entry) => {
			const layoutProps = resolveLayoutEntryProps(entry, context);
			return createElement(toReactComponent(entry.component), layoutProps, children);
		}, pageElement);
	}

	const layouts = Page.config?.layouts;
	if (layouts && layouts.length > 0) {
		const layoutProps = context.locals ? { locals: context.locals } : {};
		return [...layouts]
			.reverse()
			.reduce<ReactElement>(
				(children, Layout) => createElement(toReactComponent(Layout), layoutProps, children),
				pageElement,
			);
	}

	const Layout = Page.config?.layout;
	if (!Layout) {
		return pageElement;
	}

	const layoutProps = context.locals ? { locals: context.locals } : {};
	return createElement(toReactComponent(Layout), layoutProps, pageElement);
}

/**
 * Builds a layout tree from explicit shell entries when page config is not normalized yet.
 */
export function composeLayoutPageTreeFromShell<P extends Record<string, unknown>>(
	Page: ComposablePage<P>,
	pageProps: P,
	shellLayouts: LayoutShellEntry[],
	options?: { context?: LayoutComposeContext },
): ReactElement {
	if (shellLayouts.length === 0) {
		return composeLayoutPageTree(Page, pageProps, options);
	}

	const pageElement = createElement(Page, pageProps);

	return [...shellLayouts].reverse().reduce<ReactElement>((children, entry) => {
		return createElement(toReactComponent(entry.component), entry.props ?? {}, children);
	}, pageElement);
}

/**
 * Normalizes page config layout metadata to an outer→inner component list.
 */
export function normalizePageLayoutComponents(
	layouts?: EcoDeclaredComponent[],
	legacyLayout?: EcoDeclaredComponent,
): EcoDeclaredComponent[] {
	if (layouts && layouts.length > 0) {
		return layouts;
	}

	return legacyLayout ? [legacyLayout] : [];
}
