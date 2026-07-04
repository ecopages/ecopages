import type { EcoPageLayoutEntry, LayoutPropsContext, RequestLocals } from '../../types/public-types.ts';

export type LayoutShellPropsContext = LayoutPropsContext & {
	pageProps?: Record<string, unknown>;
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
		locals: context.locals as RequestLocals | undefined,
	};

	return {
		...shellProps,
		...entry.props(layoutPropsContext),
	};
}

/**
 * Reads the normalized layout stack from a page component config.
 */
export function resolvePageLayoutComponents(
	layouts?: EcoPageLayoutEntry['component'][],
	legacyLayout?: EcoPageLayoutEntry['component'],
): EcoPageLayoutEntry['component'][] {
	if (layouts && layouts.length > 0) {
		return layouts;
	}

	return legacyLayout ? [legacyLayout] : [];
}
