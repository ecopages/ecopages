import { isStaticAssetHref } from './link-intent.ts';

/**
 * Canonical link interception, prefetch eligibility, and HTML fetch guards.
 * @module
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

type LinkIneligibilityReason = Exclude<LinkNavigationDecision, { shouldIntercept: true }>['reason'];

/**
 * Shared anchor/href checks for navigation interception and prefetch eligibility.
 */
function getLinkIneligibilityReason(
	link: HTMLAnchorElement,
	options: LinkNavigationPolicyOptions,
): LinkIneligibilityReason | null {
	if (options.noPrefetchAttribute && link.hasAttribute(options.noPrefetchAttribute)) {
		return 'no-prefetch';
	}
	if (options.reloadAttribute && link.hasAttribute(options.reloadAttribute)) {
		return 'explicit-reload';
	}
	if (link.hasAttribute('download')) {
		return 'download';
	}

	const href = link.getAttribute('href');
	if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
		return 'invalid-href';
	}

	const url = new URL(href, window.location.origin);
	if (url.origin !== window.location.origin) {
		return 'cross-origin';
	}
	if (isStaticAssetHref(href)) {
		return 'static-asset';
	}

	return null;
}

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

	const ineligibility = getLinkIneligibilityReason(link, options);
	if (ineligibility) {
		return { shouldIntercept: false, reason: ineligibility };
	}

	const href = link.getAttribute('href')!;
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
	if (getLinkIneligibilityReason(link, options)) {
		return false;
	}

	const href = link.getAttribute('href')!;
	try {
		const url = new URL(href, window.location.origin);
		const currentPath = window.location.pathname + window.location.search;
		const targetPath = url.pathname + url.search;
		return currentPath !== targetPath;
	} catch {
		return false;
	}
}

/**
 * @remarks
 * Prefetch and SPA fetches request HTML. Only explicit `text/html` and
 * `application/xhtml+xml` responses are accepted; missing or asset types are rejected.
 */
export function isHtmlPageResponse(response: Response): boolean {
	const contentType = response.headers.get('Content-Type');
	if (!contentType) {
		return false;
	}

	const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
	return normalized === 'text/html' || normalized === 'application/xhtml+xml';
}

/**
 * @remarks
 * Servers should send `text/html`. When the type is missing or the runtime
 * defaults to `text/plain` (common in tests), a document-shaped body is accepted.
 */
export async function assertHtmlPageResponse(response: Response): Promise<void> {
	if (isHtmlPageResponse(response)) {
		return;
	}

	const contentType = response.headers.get('Content-Type');
	const normalized = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';

	if (normalized === 'text/plain' || normalized === '') {
		const sample = (await response.clone().text()).trimStart();
		if (sample.startsWith('<')) {
			return;
		}
	}

	throw new Error(`Expected HTML page response, received ${contentType ?? 'unknown content type'}`);
}
