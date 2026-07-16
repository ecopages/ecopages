import * as bundledReact from 'react';
import type { FunctionComponent, ReactElement } from 'react';
import type {
	EcoComponent,
	EcoDeclaredComponent,
	EcoPageLayoutEntry,
	LayoutPropsContext,
	RequestLocals,
} from '@ecopages/core';
import type { EcoComponentConfig } from '@ecopages/core';

export type LayoutComposeContext = LayoutPropsContext;

export type ReactRuntime = typeof bundledReact;

export type LayoutComposeOptions = {
	context?: LayoutComposeContext;
	/** @remarks Pass the app-resolved React runtime during SSR so composition matches `renderToString`. */
	react?: ReactRuntime;
	/**
	 * Optional resolver that substitutes cached layout instances and React keys
	 * for SPA layout persistence.
	 */
	resolvePersistedTier?: (layout: EcoComponent, index: number) => { layout: EcoComponent; key?: string };
};

function resolveReact(options?: LayoutComposeOptions): ReactRuntime {
	return options?.react ?? bundledReact;
}

export type LayoutShellEntry = {
	component: EcoComponent;
	props?: Record<string, unknown>;
};

export type ComposablePage<P extends Record<string, unknown> = Record<string, unknown>> = FunctionComponent<P> & {
	config?: Pick<EcoComponentConfig, 'layouts' | 'layoutEntries'>;
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
 * Builds layout prop factory context from document-shell layout entries.
 *
 * @remarks
 * Route-scoped `locals` come from shell layout props, not `pageProps.locals` (pageLocals).
 */
export function resolveLayoutContextFromShell(
	pageProps: Record<string, unknown>,
	shellLayouts: LayoutShellEntry[],
): LayoutComposeContext {
	const context: LayoutComposeContext = {};
	if (pageProps.params !== undefined) {
		context.params = pageProps.params as Record<string, string>;
	}
	if (pageProps.query !== undefined) {
		context.query = pageProps.query as Record<string, string>;
	}
	for (const entry of shellLayouts) {
		if (entry.props !== undefined && Object.prototype.hasOwnProperty.call(entry.props, 'locals')) {
			context.locals = entry.props.locals as RequestLocals;
			break;
		}
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
 *
 * @remarks
 * Layout prop factories receive `LayoutPropsContext`. For SSR, pass `options.react` from the
 * app-resolved runtime. Client code can omit it and use the bundled React import.
 */
export function composeLayoutPageTree<P extends Record<string, unknown>>(
	Page: ComposablePage<P>,
	pageProps: P,
	options?: LayoutComposeOptions,
): ReactElement {
	const { createElement } = resolveReact(options);
	const context = options?.context ?? resolveLayoutContext(pageProps);
	const pageElement = createElement(Page, pageProps);
	const layoutEntries = Page.config?.layoutEntries;
	const resolvePersistedTier = options?.resolvePersistedTier;

	if (layoutEntries && layoutEntries.length > 0) {
		return [...layoutEntries].reverse().reduce<ReactElement>((children, entry, reverseIndex) => {
			const index = layoutEntries.length - 1 - reverseIndex;
			const layoutProps = resolveLayoutEntryProps(entry, context);
			const tier = resolvePersistedTier?.(entry.component, index);
			const Layout = toReactComponent(tier?.layout ?? entry.component);
			const elementProps = tier?.key ? { key: tier.key, ...layoutProps } : layoutProps;
			return createElement(Layout, elementProps, children);
		}, pageElement);
	}

	const layouts = Page.config?.layouts;
	if (layouts && layouts.length > 0) {
		const layoutProps = context.locals ? { locals: context.locals } : {};
		return [...layouts].reverse().reduce<ReactElement>((children, Layout, reverseIndex) => {
			const index = layouts.length - 1 - reverseIndex;
			const tier = resolvePersistedTier?.(Layout, index);
			const ResolvedLayout = toReactComponent(tier?.layout ?? Layout);
			const elementProps = tier?.key ? { key: tier.key, ...layoutProps } : layoutProps;
			return createElement(ResolvedLayout, elementProps, children);
		}, pageElement);
	}

	return pageElement;
}

/**
 * Builds a layout tree from explicit document-shell layout entries.
 *
 * @remarks
 * Use when the route renderer passes per-tier props (e.g. route `locals` on the layout tier).
 * Shell `entry.props` are authoritative; page config normalization is not required.
 */
export function composeLayoutPageTreeFromShell<P extends Record<string, unknown>>(
	Page: ComposablePage<P>,
	pageProps: P,
	shellLayouts: LayoutShellEntry[],
	options?: LayoutComposeOptions,
): ReactElement {
	const { createElement } = resolveReact(options);
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
export function normalizePageLayoutComponents(layouts?: EcoDeclaredComponent[]): EcoDeclaredComponent[] {
	return layouts && layouts.length > 0 ? layouts : [];
}
