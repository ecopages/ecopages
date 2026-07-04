import { createElement, type ComponentType, type ReactElement } from 'react';
import type {
	EcoDeclaredComponent,
	EcoPageComponent,
	EcoPageLayoutComponent,
	EcoPageLayoutEntry,
	LayoutPropsContext,
	RequestLocals,
} from '@ecopages/core';

export type LayoutComposeContext = LayoutPropsContext;

function asReactComponent(
	component: EcoDeclaredComponent | EcoPageLayoutComponent,
): ComponentType<Record<string, unknown>> {
	return component as ComponentType<Record<string, unknown>>;
}

function resolveLayoutContext(pageProps: Record<string, unknown>): LayoutComposeContext {
	return {
		params: pageProps.params as Record<string, string> | undefined,
		query: pageProps.query as Record<string, string> | undefined,
		locals: pageProps.locals as RequestLocals | undefined,
	};
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
 * Builds the client or SSR React tree for a page and its outer→inner layout stack.
 */
export function composeLayoutPageTree(
	Page: EcoPageComponent<Record<string, unknown>>,
	pageProps: Record<string, unknown>,
	options?: { context?: LayoutComposeContext },
): ReactElement {
	const context = options?.context ?? resolveLayoutContext(pageProps);
	const pageElement = createElement(Page, pageProps);
	const layoutEntries = Page.config?.layoutEntries;

	if (layoutEntries && layoutEntries.length > 0) {
		return [...layoutEntries].reverse().reduce<ReactElement>((children, entry) => {
			const layoutProps = resolveLayoutEntryProps(entry, context);
			return createElement(asReactComponent(entry.component), layoutProps, children);
		}, pageElement);
	}

	const layouts = Page.config?.layouts;
	if (layouts && layouts.length > 0) {
		const layoutProps = context.locals ? { locals: context.locals } : {};
		return [...layouts]
			.reverse()
			.reduce<ReactElement>(
				(children, Layout) => createElement(asReactComponent(Layout), layoutProps, children),
				pageElement,
			);
	}

	const Layout = Page.config?.layout;
	if (!Layout) {
		return pageElement;
	}

	const layoutProps = context.locals ? { locals: context.locals } : null;
	return createElement(asReactComponent(Layout), layoutProps ?? {}, pageElement);
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
