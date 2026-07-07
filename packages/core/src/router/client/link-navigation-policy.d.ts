/**
 * Canonical link navigation policy for Ecopages client routers.
 * @module
 */
export type { LinkNavigationDecision, LinkNavigationPolicyOptions } from './link-navigation-policy.ts';
export {
	assertHtmlPageResponse,
	getLinkNavigationDecision,
	getNavigableHrefFromClick,
	isHtmlPageResponse,
	isSamePageHashNavigationHref,
	shouldPrefetchLink,
} from './link-navigation-policy.ts';
