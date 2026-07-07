import { isStaticAssetHref } from './link-intent.ts';

/**
 * Options shared by link interception and prefetch eligibility checks.
 */
export type LinkNavigationPolicyOptions = {
	/** Attribute that forces a full document reload instead of SPA navigation. */
	reloadAttribute?: string;
	/** Attribute that opts a link out of prefetch. */
	noPrefetchAttribute?: string;
};

export type LinkNavigationDecision =
	| { shouldIntercept: true; href: string }
	| {
			shouldIntercept: false;
			reason:
				| 'modified-click'
				| 'non-left-click'
				| 'external-target'
				| 'explicit-reload'
				| 'download'
				| 'no-prefetch'
				| 'invalid-href'
				| 'cross-origin'
				| 'static-asset'
				| 'same-page-hash';
	  };

/**
 * Returns whether an href only adds a hash fragment on the current page.
 */
export function isSamePageHashNavigationHref(href: string): boolean {
	if (!href) {
		return false;
	}

	const currentUrl = new URL(window.location.href);
	const targetUrl = new URL(href, currentUrl);

	return (
		targetUrl.origin === currentUrl.origin &&
		targetUrl.hash.length > 0 &&
		targetUrl.pathname === currentUrl.pathname &&
		targetUrl.search === currentUrl.search
	);
}

/**
 * Decides whether a pointer or click on an anchor should be handled as SPA navigation.
 */
export function getLinkNavigationDecision(
	event: MouseEvent | PointerEvent,
	link: HTMLAnchorElement,
	options: LinkNavigationPolicyOptions,
): LinkNavigationDecision {
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
		return { shouldIntercept: false, reason: 'modified-click' };
	}
	if (event.button !== 0) {
		return { shouldIntercept: false, reason: 'non-left-click' };
	}

	const target = link.getAttribute('target');
	if (target && target !== '_self') {
		return { shouldIntercept: false, reason: 'external-target' };
	}

	if (options.reloadAttribute && link.hasAttribute(options.reloadAttribute)) {
		return { shouldIntercept: false, reason: 'explicit-reload' };
	}
	if (link.hasAttribute('download')) {
		return { shouldIntercept: false, reason: 'download' };
	}

	const href = link.getAttribute('href');
	if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
		return { shouldIntercept: false, reason: 'invalid-href' };
	}

	const url = new URL(href, window.location.origin);
	if (url.origin !== window.location.origin) {
		return { shouldIntercept: false, reason: 'cross-origin' };
	}
	if (isStaticAssetHref(href)) {
		return { shouldIntercept: false, reason: 'static-asset' };
	}
	if (isSamePageHashNavigationHref(href)) {
		return { shouldIntercept: false, reason: 'same-page-hash' };
	}

	return { shouldIntercept: true, href };
}

/**
 * Returns the href when SPA navigation should intercept the click, otherwise `null`.
 */
export function getNavigableHrefFromClick(
	event: MouseEvent | PointerEvent,
	link: HTMLAnchorElement,
	options: LinkNavigationPolicyOptions,
): string | null {
	const decision = getLinkNavigationDecision(event, link, options);
	return decision.shouldIntercept ? decision.href : null;
}

/**
 * Returns whether a link is eligible for hover or viewport prefetch.
 */
export function shouldPrefetchLink(link: HTMLAnchorElement, options: LinkNavigationPolicyOptions): boolean {
	if (options.noPrefetchAttribute && link.hasAttribute(options.noPrefetchAttribute)) {
		return false;
	}
	if (options.reloadAttribute && link.hasAttribute(options.reloadAttribute)) {
		return false;
	}
	if (link.hasAttribute('download')) {
		return false;
	}

	const href = link.getAttribute('href');
	if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
		return false;
	}
	if (isStaticAssetHref(href)) {
		return false;
	}

	try {
		const url = new URL(href, window.location.origin);
		if (url.origin !== window.location.origin) {
			return false;
		}

		const currentPath = window.location.pathname + window.location.search;
		const targetPath = url.pathname + url.search;
		return currentPath !== targetPath;
	} catch {
		return false;
	}
}

/**
 * @remarks
 * Prefetch and SPA fetches request HTML. Static markdown, plain text, and other
 * asset responses must not be parsed as documents.
 */
export function isHtmlPageResponse(response: Response): boolean {
	const contentType = response.headers.get('Content-Type');
	if (!contentType) {
		return true;
	}

	const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
	return normalized === 'text/html' || normalized === 'application/xhtml+xml';
}
