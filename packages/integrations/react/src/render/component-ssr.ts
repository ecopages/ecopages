/**
 * React component SSR helpers: renderToString, foreign-subtree HTML, island attributes.
 */

import type { ComponentRenderInput, EcoComponent, EcoPagesElement } from '@ecopages/core';
import type { IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import type { ReactNode } from 'react';
import { isValidElement } from 'react';
import { asReactComponent, type SerializableProps } from './component-ownership.ts';
import { ReactRenderError } from './errors.ts';
import type { ReactRuntimeModules } from './react-runtime.ts';

export type ReactComponentRenderContext = {
	componentInstanceId?: string;
};

export type ReactForeignSubtreeResolutionContext = {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
	nextForeignSubtreeId: number;
	queuedResolutions: Array<{
		token: string;
		component: EcoComponent;
		props: Record<string, unknown>;
		componentInstanceId: string;
	}>;
	rawChildrenToken?: string;
	rawChildrenHtml?: string;
};

export function buildHydrationProps(props: SerializableProps | undefined): SerializableProps {
	if (!props || !Object.prototype.hasOwnProperty.call(props, 'locals')) {
		return props ?? {};
	}

	const { locals: _locals, ...hydrationProps } = props;
	return hydrationProps;
}

/**
 * Renders a non-React layout or HTML template and enforces that mixed shells
 * return serialized HTML.
 */
export async function renderNonReactShellComponent<P extends SerializableProps>(
	Component: (props: P) => EcoPagesElement | Promise<EcoPagesElement>,
	props: P,
	label: 'Layout' | 'HtmlTemplate' | 'Component',
): Promise<string> {
	const output = await Component(props);
	if (typeof output === 'string') {
		return output;
	}

	throw new ReactRenderError(`${label} must return a string when used as a mixed shell for React pages.`);
}

/**
 * Renders one React component while preserving already-resolved child HTML.
 *
 * @remarks
 * When nested foreign-subtree resolution has already produced child HTML, the child
 * payload must remain raw SSR output rather than a React string child, otherwise
 * React would escape it. This helper renders a unique token through React and swaps
 * that token back to the resolved HTML afterward.
 */
export function renderComponentHtml(options: {
	input: ComponentRenderInput;
	context: ReactComponentRenderContext;
	runtimeContext?: ReactForeignSubtreeResolutionContext;
	runtime: ReactRuntimeModules;
}): string {
	const { input, context, runtimeContext, runtime } = options;
	const { react, reactDomServer } = runtime;

	if (input.children === undefined) {
		return reactDomServer.renderToString(react.createElement(asReactComponent(input.component), input.props));
	}

	if (isValidElement(input.children)) {
		return reactDomServer.renderToString(
			react.createElement(asReactComponent(input.component), input.props, input.children),
		);
	}

	const resolvedChildHtml = typeof input.children === 'string' ? input.children : String(input.children ?? '');
	const rawChildrenToken = `__ECO_RAW_HTML_CHILD_${context.componentInstanceId ?? 'component'}__`;
	if (runtimeContext) {
		runtimeContext.rawChildrenToken = rawChildrenToken;
		runtimeContext.rawChildrenHtml = resolvedChildHtml;
	}
	const html = reactDomServer.renderToString(
		react.createElement(asReactComponent(input.component), input.props, rawChildrenToken),
	);
	return html.split(rawChildrenToken).join(resolvedChildHtml);
}

export function toReactNode(children: unknown, integrationName: string): ReactNode {
	if (
		children === null ||
		typeof children === 'string' ||
		typeof children === 'number' ||
		typeof children === 'boolean' ||
		isValidElement(children) ||
		Array.isArray(children)
	) {
		return children;
	}

	throw new TypeError(`[ecopages] ${integrationName} renderer expected a React node child.`);
}

/**
 * Restores raw child HTML placeholders stored on the foreign-subtree runtime context.
 *
 * @remarks
 * Queued foreign-subtree resolution may render children through a fragment path before
 * nested integration tokens are resolved. React must never see resolved child HTML as a
 * normal string child or it would escape it.
 */
export function restoreRuntimeChildHtml(
	html: string,
	runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
): string {
	if (!runtimeContext?.rawChildrenToken || runtimeContext.rawChildrenHtml === undefined) {
		return html;
	}

	return html.split(runtimeContext.rawChildrenToken).join(runtimeContext.rawChildrenHtml);
}
