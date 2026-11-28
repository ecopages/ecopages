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

	const url = new URL(link.href);
	if (url.origin !== window.location.origin) {
		return 'cross-origin';
	}
	if (isStaticAssetHref(link.href)) {
		return 'static-asset';
	}

	return null;
}

/**
 * Returns the same-origin path, query, and hash an anchor navigates to.
 *
 * @remarks
 * Resolves through the anchor's own `href` property, so relative links (`?page=2`,
 * `next`, `../x`) and `<base href>` resolve exactly as a full page load would instead
 * of against the origin. Call only after the link passed the same-origin checks.
 */
function getLinkNavigationHref(link: HTMLAnchorElement): string {
	const url = new URL(link.href);
	return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Returns whether an href targets the current origin, pathname, and query.
 *
 * @remarks
 * Fragments are ignored because they scroll within the current page and do not
 * require fetching another document.
 */
export function isSamePageHref(href: string, currentHref: string = window.location.href): boolean {
	if (!href) {
		return false;
	}

	const currentUrl = new URL(currentHref, typeof window === 'undefined' ? 'http://localhost/' : window.location.href);
	const targetUrl = new URL(href, currentUrl);

	return (
		targetUrl.origin === currentUrl.origin &&
		targetUrl.pathname === currentUrl.pathname &&
		targetUrl.search === currentUrl.search
	);
}

/** Returns whether an href adds a fragment to the current page. */
export function isSamePageHashNavigationHref(href: string): boolean {
	return new URL(href, window.location.href).hash.length > 0 && isSamePageHref(href);
}

/**
 * Decides whether a pointer or click on an anchor should be handled as SPA navigation.
 *
 * @remarks
 * An intercepted decision carries the resolved same-origin path, query, and hash, never the raw attribute.
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

	const href = getLinkNavigationHref(link);
	if (isSamePageHashNavigationHref(href)) {
		return { shouldIntercept: false, reason: 'same-page-hash' };
	}

	return { shouldIntercept: true, href };
}

/**
 * Returns the resolved same-origin href when SPA navigation should intercept the click, otherwise `null`.
 */
export function getNavigableHrefFromClick(
	event: MouseEvent | PointerEvent,
	link: HTMLAnchorElement,
	options: LinkNavigationPolicyOptions,
): string | null {
	const decision = getLinkNavigationDecision(event, link, options);
	return decision.shouldIntercept ? decision.href : null;
}

export type FormNavigationDecision =
	| { shouldIntercept: true; href: string }
	| {
			shouldIntercept: false;
			reason:
				| 'not-a-form'
				| 'default-prevented'
				| 'non-get-method'
				| 'external-target'
				| 'explicit-reload'
				| 'cross-origin'
				| 'static-asset';
	  };

/**
 * Decides whether a form submission should be handled as SPA navigation.
 *
 * @remarks
 * Only a GET submission to a same-origin page is a navigation: the browser would load the action URL with the
 * fields as its query, and the decision carries that same-origin path, query and hash. The method, action and
 * target come from the submitter first (`formmethod`, `formaction`, `formtarget`), then the form, and the
 * attributes are read by name, since a control named `action` or `method` shadows the form's own property. The
 * fields are serialized as a browser does, a file as its name, and the action's own query is replaced. The
 * decision is taken after the page's own `submit` listeners, so a submission one of them cancelled is its own.
 */
export function getFormNavigationDecision(
	event: SubmitEvent,
	options: LinkNavigationPolicyOptions,
): FormNavigationDecision {
	const form = event.target;
	if (!(form instanceof HTMLFormElement)) {
		return { shouldIntercept: false, reason: 'not-a-form' };
	}
	if (event.defaultPrevented) {
		return { shouldIntercept: false, reason: 'default-prevented' };
	}

	const submitter = event.submitter;
	const ownership = getFormOwnershipReason(form, submitter, options);
	if (ownership) {
		return { shouldIntercept: false, reason: ownership };
	}

	const action = submitter?.getAttribute('formaction') || form.getAttribute('action');
	const url = new URL(action || window.location.href, document.baseURI);
	if (url.origin !== window.location.origin) {
		return { shouldIntercept: false, reason: 'cross-origin' };
	}
	if (isStaticAssetHref(url.href)) {
		return { shouldIntercept: false, reason: 'static-asset' };
	}

	const params = new URLSearchParams();
	for (const [name, value] of new FormData(form, submitter)) {
		params.append(name, typeof value === 'string' ? value : value.name);
	}
	url.search = params.toString();

	return { shouldIntercept: true, href: `${url.pathname}${url.search}${url.hash}` };
}

/** Why a submission is left to the browser for its method, target or opt-out, before its action is looked at. */
function getFormOwnershipReason(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
	options: LinkNavigationPolicyOptions,
): 'non-get-method' | 'external-target' | 'explicit-reload' | null {
	const method = (submitter?.getAttribute('formmethod') || form.getAttribute('method') || 'get').toLowerCase();
	if (method !== 'get') {
		return 'non-get-method';
	}

	const target = submitter?.getAttribute('formtarget') || form.getAttribute('target');
	if (target && target !== '_self') {
		return 'external-target';
	}

	const reloadAttribute = options.reloadAttribute;
	if (reloadAttribute && (form.hasAttribute(reloadAttribute) || submitter?.hasAttribute(reloadAttribute))) {
		return 'explicit-reload';
	}

	return null;
}

/**
 * Returns the resolved same-origin href when SPA navigation should intercept the submission, otherwise `null`.
 */
export function getNavigableHrefFromSubmit(event: SubmitEvent, options: LinkNavigationPolicyOptions): string | null {
	const decision = getFormNavigationDecision(event, options);
	return decision.shouldIntercept ? decision.href : null;
}

/**
 * Returns whether a link is eligible for hover or viewport prefetch.
 */
export function shouldPrefetchLink(link: HTMLAnchorElement, options: LinkNavigationPolicyOptions): boolean {
	if (getLinkIneligibilityReason(link, options)) {
		return false;
	}

	return !isSamePageHref(getLinkNavigationHref(link));
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
