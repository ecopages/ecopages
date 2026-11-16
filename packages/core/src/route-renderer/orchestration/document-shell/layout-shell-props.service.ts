import type {
	EcoComponent,
	EcoPageLayoutEntry,
	LayoutPropsContext,
	LayoutRequestContext,
} from '../../../types/contracts.ts';
import type { DocumentShellLayoutInput } from './document-shell-render.service.ts';

export type LayoutShellPropsContext = LayoutPropsContext & {
	pageProps?: Record<string, unknown>;
};

export type DocumentShellLayoutResolutionInput = LayoutShellPropsContext & {
	layout?: EcoComponent;
	layoutEntries?: EcoPageLayoutEntry[];
};

/**
 * Resolves the props one layout tier renders with: what its `props` factory returns, or nothing.
 *
 * @remarks
 * A layout receives request data only through its factory, so the server and the browser render the tier from
 * the same props. The factory sees `locals`; the layout itself does not. A Static Page renders without a request,
 * so its factories receive empty `locals`; their type has no `locals` to read.
 */
export function resolveLayoutEntryProps(
	entry: EcoPageLayoutEntry,
	context: LayoutShellPropsContext,
): Record<string, unknown> {
	if (!entry.props) {
		return {};
	}

	const layoutPropsContext: LayoutRequestContext = {
		params: context.params,
		query: context.query,
		locals: context.locals ?? {},
	};

	return entry.props(layoutPropsContext);
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

	return input.layout ? [{ component: input.layout, props: {} }] : [];
}

const layoutsByRender = new WeakMap<object, DocumentShellLayoutInput[]>();

/**
 * Resolves the layouts of one render, once per `render` object, the render options both callers hold.
 *
 * @remarks
 * The document shell renders each tier from these props and an integration writes the same props into its page
 * payload. Resolving them for each would run every layout factory twice per request, and a factory that is not
 * deterministic, such as one reading the clock, would give the HTML and the payload different values.
 */
export function resolveRenderLayouts(
	render: object,
	input: DocumentShellLayoutResolutionInput,
): DocumentShellLayoutInput[] {
	let layouts = layoutsByRender.get(render);
	if (!layouts) {
		layouts = resolveDocumentShellLayouts(input);
		layoutsByRender.set(render, layouts);
	}
	return layouts;
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
