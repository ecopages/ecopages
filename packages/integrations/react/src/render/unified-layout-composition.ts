/**
 * Unified React layout + page composition for SSR document shells.
 *
 * @remarks
 * When every shell layout is React-managed, compose one element tree via
 * {@link composeLayoutPageTree} / {@link composeLayoutPageTreeFromShell} instead of
 * rendering each tier separately. This keeps SSR DOM shape aligned with client
 * hydration through `@ecopages/react/layout-compose`.
 */

import type { EcoComponent } from '@ecopages/core';
import type { DocumentShellLayoutInput } from '@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service';
import type { ReactElement } from 'react';
import { isReactManagedComponent } from './component-ownership.ts';
import {
	assertComposablePage,
	composeLayoutPageTree,
	composeLayoutPageTreeFromShell,
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
