import type { EcoComponent, EcoPageLayoutEntry, LayoutPropsContext } from '../../../types/public-types.ts';
import type { DocumentShellLayoutInput } from './document-shell-render.service.ts';

export type LayoutShellPropsContext = LayoutPropsContext & {
	pageProps?: Record<string, unknown>;
};

export type DocumentShellLayoutResolutionInput = LayoutShellPropsContext & {
	layout?: EcoComponent;
	layoutEntries?: EcoPageLayoutEntry[];
};

/**
 * Resolves the default shell props passed to a layout tier during route render.
 */
export function resolveLayoutShellProps(context: LayoutShellPropsContext): Record<string, unknown> {
	return context.locals ? { locals: context.locals } : {};
}

/**
 * Resolves props for one layout entry, merging shell props with an optional factory.
 */
export function resolveLayoutEntryProps(
	entry: EcoPageLayoutEntry,
	context: LayoutShellPropsContext,
): Record<string, unknown> {
	const shellProps = resolveLayoutShellProps(context);
	if (!entry.props) {
		return shellProps;
	}

	const layoutPropsContext: LayoutPropsContext = {
		params: context.params,
		query: context.query,
		locals: context.locals,
	};

	return {
		...shellProps,
		...entry.props(layoutPropsContext),
	};
}

/**
 * Resolves declarative layout entries into the document-shell inputs used during route render.
 *
 * @remarks Layout prop factories must be evaluated here so integrations do not
 * silently fall back to the innermost layout and discard route-specific props.
 */
export function resolveDocumentShellLayouts(input: DocumentShellLayoutResolutionInput): DocumentShellLayoutInput[] {
	if (input.layoutEntries && input.layoutEntries.length > 0) {
		return input.layoutEntries.map((entry) => ({
			component: entry.component,
			props: resolveLayoutEntryProps(entry, input),
		}));
	}

	return input.layout ? [{ component: input.layout, props: resolveLayoutShellProps(input) }] : [];
}

/**
 * Reads the normalized layout stack from a page component config.
 */
export function resolvePageLayoutComponents(
	layouts?: EcoPageLayoutEntry['component'][],
): EcoPageLayoutEntry['component'][] {
	return layouts && layouts.length > 0 ? layouts : [];
}

/**
 * Returns the innermost layout component from a normalized page layout stack.
 */
export function resolveInnermostPageLayout(
	layouts?: EcoPageLayoutEntry['component'][],
): EcoPageLayoutEntry['component'] | undefined {
	const stack = resolvePageLayoutComponents(layouts);
	return stack[stack.length - 1];
}
