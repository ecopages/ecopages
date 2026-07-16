/**
 * Unified React layout + page composition for SSR document shells.
 *
 * @remarks
 * When every shell layout is React-managed, compose one element tree via
 * {@link composeLayoutPageTree} / {@link composeLayoutPageTreeFromShell} instead of
 * rendering each tier separately. This keeps SSR DOM shape aligned with client
 * hydration through `@ecopages/react/layout-compose`.
 */

import type { ComponentRenderInput, ComponentRenderResult, EcoComponent } from '@ecopages/core';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import type {
	DocumentShellComposeChildrenContext,
	DocumentShellComposeChildrenResult,
	DocumentShellLayoutInput,
} from '@ecopages/core/route-renderer/orchestration/document-shell-render.service';
import type { ReactElement } from 'react';
import { hasSingleRootElement } from './html-boundary.ts';
import { isReactManagedComponent } from './component-ownership.ts';
import type { ReactForeignSubtreeResolutionContext } from './component-ssr.ts';
import type { ReactRuntimeModules } from './react-runtime.ts';
import {
	assertComposablePage,
	composeLayoutPageTree,
	composeLayoutPageTreeFromShell,
	resolveLayoutContextFromShell,
	type ComposablePage,
	type LayoutComposeOptions,
} from './layout-compose.ts';

export function composeReactLayoutPageTree(
	Page: ComposablePage,
	pageProps: Record<string, unknown>,
	shellEntries: Array<{ component: EcoComponent; props?: Record<string, unknown> }>,
	options: LayoutComposeOptions,
): ReactElement {
	const hasNormalizedLayouts = Boolean(Page.config?.layoutEntries?.length) || Boolean(Page.config?.layouts?.length);

	if (hasNormalizedLayouts) {
		return composeLayoutPageTree(Page, pageProps, options);
	}

	return composeLayoutPageTreeFromShell(Page, pageProps, shellEntries, options);
}

export function shouldUseUnifiedReactLayoutComposition(options: {
	page: EcoComponent;
	shellLayouts: DocumentShellLayoutInput[];
	reactIntegrationName: string;
}): boolean {
	const { page, shellLayouts, reactIntegrationName } = options;

	if (!isReactManagedComponent(page, reactIntegrationName)) {
		return false;
	}

	const composablePage = assertComposablePage(page);
	const configLayouts =
		composablePage.config?.layouts ?? composablePage.config?.layoutEntries?.map((entry) => entry.component) ?? [];

	const layoutComponents = shellLayouts.length > 0 ? shellLayouts.map((layout) => layout.component) : configLayouts;

	if (layoutComponents.length === 0) {
		return false;
	}

	return layoutComponents.every((component) => isReactManagedComponent(component, reactIntegrationName));
}

export function resolveComposeChildren(options: {
	page: { component: EcoComponent; props: Record<string, unknown> };
	shellLayouts: DocumentShellLayoutInput[];
	reactIntegrationName: string;
	composeChildren: (
		page: { component: EcoComponent; props: Record<string, unknown> },
		context: DocumentShellComposeChildrenContext,
	) => Promise<DocumentShellComposeChildrenResult>;
}): ((context: DocumentShellComposeChildrenContext) => Promise<DocumentShellComposeChildrenResult>) | undefined {
	const { page, shellLayouts, reactIntegrationName, composeChildren } = options;

	if (
		!shouldUseUnifiedReactLayoutComposition({
			page: page.component,
			shellLayouts,
			reactIntegrationName,
		})
	) {
		return undefined;
	}

	return (context) => composeChildren(page, context);
}

export async function composeReactLayoutPageChildren(options: {
	page: { component: EcoComponent; props: Record<string, unknown> };
	context: DocumentShellComposeChildrenContext;
	runtime: ReactRuntimeModules;
	integrationName: string;
	normalizeUnresolvedMarkerArtifactHtml: (html: string) => string;
	getRootTagName: (html: string) => string | undefined;
	getQueuedForeignSubtreeResolutionContext: (
		input: ComponentRenderInput,
	) => ReactForeignSubtreeResolutionContext | undefined;
	resolveQueuedForeignSubtreeHtml: (
		html: string,
		runtimeContext: ReactForeignSubtreeResolutionContext | undefined,
	) => Promise<{ assets: ProcessedAsset[]; html: string }>;
}): Promise<DocumentShellComposeChildrenResult> {
	const {
		page,
		context,
		runtime,
		integrationName,
		normalizeUnresolvedMarkerArtifactHtml,
		getRootTagName,
		getQueuedForeignSubtreeResolutionContext,
		resolveQueuedForeignSubtreeHtml,
	} = options;

	const pageComponent = assertComposablePage(page.component);
	const shellEntries = context.layouts.map((layout) => ({
		component: layout.component,
		props: layout.props,
	}));
	const { react, reactDomServer } = runtime;
	const tree = composeReactLayoutPageTree(pageComponent, page.props, shellEntries, {
		context: resolveLayoutContextFromShell(page.props, shellEntries),
		react,
	});
	const runtimeInput: ComponentRenderInput = {
		component: page.component,
		props: page.props,
		integrationContext: {
			rendererCache: context.rendererCache as ReactForeignSubtreeResolutionContext['rendererCache'],
		},
	};
	const runtimeContext = getQueuedForeignSubtreeResolutionContext(runtimeInput);
	const html = normalizeUnresolvedMarkerArtifactHtml(reactDomServer.renderToString(tree));
	const resolved = await resolveQueuedForeignSubtreeHtml(html, runtimeContext);
	const primaryRender: ComponentRenderResult = {
		html: resolved.html,
		canAttachAttributes: hasSingleRootElement(resolved.html),
		rootTag: getRootTagName(resolved.html),
		integrationName,
		assets: resolved.assets.length > 0 ? resolved.assets : undefined,
	};

	return {
		children: resolved.html,
		layoutRenders: [],
		primaryRender,
	};
}
