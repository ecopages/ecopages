import type { EcoNavigationEvent } from '@ecopages/core/router/navigation-lifecycle';
import { manageWindowScroll } from '@ecopages/core/client/scroll';
import { syncDocumentElementAttributes } from './document-element-sync.ts';
import type { DomSwapper } from './dom/dom-swapper.ts';
import type { EcoRouterOptions } from './types.ts';

export type BrowserRouterCommitSwapInput = {
	url: URL;
	previousUrl: URL;
	direction: EcoNavigationEvent['direction'];
	newDocument: Document;
	isStaleNavigation: () => boolean;
	domSwapper: DomSwapper;
	options: Required<EcoRouterOptions>;
	useViewTransitions: boolean;
};

/**
 * Applies history, document metadata, head morph, and body swap for one navigation commit.
 */
export function runBrowserRouterCommitSwap(input: BrowserRouterCommitSwapInput): void {
	if (input.isStaleNavigation()) {
		return;
	}

	if (input.options.updateHistory && input.direction === 'forward') {
		window.history.pushState({}, '', input.url.href);
	} else if (input.direction === 'replace') {
		window.history.replaceState({}, '', input.url.href);
	}

	syncDocumentElementAttributes(document, input.newDocument, input.options.documentElementAttributesToSync);
	const { bodyStrategy } = input.domSwapper.morphHead(input.newDocument);
	if (input.useViewTransitions && bodyStrategy === 'morph') {
		input.domSwapper.morphBody(input.newDocument);
	} else {
		input.domSwapper.replaceBody(input.newDocument);
	}
	input.domSwapper.flushRerunScripts();
	manageWindowScroll(input.url, input.previousUrl, {
		scrollBehavior: input.options.scrollBehavior,
		smoothScroll: input.options.smoothScroll,
	});
}
