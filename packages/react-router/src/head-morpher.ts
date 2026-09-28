/**
 * Head morphing utilities for client-side navigation.
 * Intelligently syncs head elements between pages using key-based diffing.
 * @module
 */

import { collectRerunScripts, flushPendingRerunScripts } from '@ecopages/core/client/navigation-scripts';
import { isReactRouterPageBootstrapAssetSrc } from './hydration-assets.ts';
import {
	appendAnonymousHeadElements,
	collectRemovableHeadElements,
	indexHeadChildrenByKey,
	mergeIncomingHeadElements,
} from './head-morpher-sync.ts';

export type HeadMorphResult = {
	cleanup: () => void;
	flushRerunScripts: () => void;
};

function isReactRouterPageBootstrapScriptId(scriptId: string | null): boolean {
	return !!scriptId && scriptId.startsWith('ecopages-react-') && !scriptId.startsWith('ecopages-react-island-');
}

function isHydrationScript(el: HTMLScriptElement): boolean {
	const src = el.getAttribute('src');
	const scriptId = el.getAttribute('data-eco-script-id');
	return isReactRouterPageBootstrapScriptId(scriptId) || (!!src && isReactRouterPageBootstrapAssetSrc(src));
}

/**
 * Morphs the current document head to match the new document's head.
 *
 * @remarks
 * Returns cleanup and rerun hooks separately so callers can defer head removal
 * until after a view-transition snapshot captures the old styles.
 */
export async function morphHead(newDocument: Document): Promise<HeadMorphResult> {
	const currentHead = document.head;
	const newHead = newDocument.head;
	const currentElements = indexHeadChildrenByKey(currentHead);
	const newElements = indexHeadChildrenByKey(newHead);
	const stylesheetPromises: Promise<void>[] = [];
	const pendingRerunScripts = collectRerunScripts(newDocument, (script) => !isHydrationScript(script));

	mergeIncomingHeadElements({
		currentHead,
		newElements,
		currentElements,
		shouldSkipNewScript: isHydrationScript,
		stylesheetPromises,
	});
	appendAnonymousHeadElements(currentHead, newHead);

	if (stylesheetPromises.length > 0) {
		await Promise.all(stylesheetPromises);
	}

	const elementsToRemove = collectRemovableHeadElements(currentElements, newElements);

	return {
		cleanup: () => {
			for (const element of elementsToRemove) {
				element.remove();
			}
		},
		flushRerunScripts: () => {
			flushPendingRerunScripts(pendingRerunScripts);
		},
	};
}
