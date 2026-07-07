import { describe, expect, it } from 'vitest';
import {
	assertHtmlPageResponse,
	getLinkNavigationDecision,
	getNavigableHrefFromClick,
	isHtmlPageResponse,
	isSamePageHashNavigationHref,
	shouldPrefetchLink,
} from './link-navigation-policy.ts';

function createLink(href: string, attributes: Record<string, string> = {}): HTMLAnchorElement {
	const link = document.createElement('a');
	link.href = href;
	for (const [key, value] of Object.entries(attributes)) {
		link.setAttribute(key, value);
	}
	document.body.append(link);
	return link;
}

function createMouseEvent(button = 0, modifiers: Partial<MouseEventInit> = {}): MouseEvent {
	return new MouseEvent('click', { bubbles: true, cancelable: true, button, ...modifiers });
}

const policy = { reloadAttribute: 'data-eco-reload', noPrefetchAttribute: 'data-eco-no-prefetch' };

describe('isSamePageHashNavigationHref', () => {
	it('returns true for same pathname with a new hash', () => {
		history.replaceState({}, '', '/docs/page');
		expect(isSamePageHashNavigationHref('/docs/page#section')).toBe(true);
	});
});

describe('getLinkNavigationDecision', () => {
	it('allows same-origin page links', () => {
		const link = createLink('/page');
		const decision = getLinkNavigationDecision(createMouseEvent(), link, policy);
		expect(decision).toEqual({ shouldIntercept: true, href: '/page' });
	});

	it('rejects static asset links', () => {
		const link = createLink('/skill.txt');
		expect(getLinkNavigationDecision(createMouseEvent(), link, policy)).toEqual({
			shouldIntercept: false,
			reason: 'static-asset',
		});
	});

	it('rejects explicit reload links', () => {
		const link = createLink('/logout', { 'data-eco-reload': '' });
		expect(getLinkNavigationDecision(createMouseEvent(), link, policy)).toEqual({
			shouldIntercept: false,
			reason: 'explicit-reload',
		});
	});
});

describe('getNavigableHrefFromClick', () => {
	it('returns href when navigation should be intercepted', () => {
		const link = createLink('/page');
		expect(getNavigableHrefFromClick(createMouseEvent(), link, policy)).toBe('/page');
	});

	it('returns null for static assets', () => {
		const link = createLink('/llms.txt');
		expect(getNavigableHrefFromClick(createMouseEvent(), link, policy)).toBeNull();
	});
});

describe('shouldPrefetchLink', () => {
	it('prefetches internal page links', () => {
		history.replaceState({}, '', '/');
		const link = createLink('/docs/intro');
		expect(shouldPrefetchLink(link, policy)).toBe(true);
	});

	it('skips static assets and opt-outs', () => {
		history.replaceState({}, '', '/');
		expect(shouldPrefetchLink(createLink('/skill.txt'), policy)).toBe(false);
		expect(shouldPrefetchLink(createLink('/page', { 'data-eco-no-prefetch': '' }), policy)).toBe(false);
	});
});

describe('isHtmlPageResponse', () => {
	it('accepts html content types', () => {
		expect(isHtmlPageResponse(new Response('', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))).toBe(
			true,
		);
	});

	it('rejects plain text responses', () => {
		expect(isHtmlPageResponse(new Response('', { headers: { 'Content-Type': 'text/plain' } }))).toBe(false);
	});
});

describe('assertHtmlPageResponse', () => {
	it('throws for non-html responses', async () => {
		await expect(
			assertHtmlPageResponse(new Response('text', { headers: { 'Content-Type': 'text/plain' } })),
		).rejects.toThrow(/Expected HTML page response/);
	});

	it('accepts document-shaped bodies when the runtime defaults to text/plain', async () => {
		await expect(
			assertHtmlPageResponse(new Response('<html><body></body></html>', { status: 200 })),
		).resolves.toBeUndefined();
	});
});
