import { afterEach, describe, expect, it } from 'vitest';
import {
	getLinkNavigationDecision,
	getNavigableHrefFromClick,
	isSamePageHashNavigationHref,
	shouldPrefetchLink,
	type LinkNavigationDecision,
	type LinkNavigationPolicyOptions,
} from './link-navigation-policy.ts';

function createLink(href: string | null, attributes: Record<string, string> = {}): HTMLAnchorElement {
	const link = document.createElement('a');
	if (href !== null) link.setAttribute('href', href);
	for (const [key, value] of Object.entries(attributes)) {
		link.setAttribute(key, value);
	}
	document.body.append(link);
	return link;
}

function createMouseEvent(modifiers: MouseEventInit = {}): MouseEvent {
	return new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...modifiers });
}

const policy: LinkNavigationPolicyOptions = {
	reloadAttribute: 'data-eco-reload',
	noPrefetchAttribute: 'data-eco-no-prefetch',
};

afterEach(() => {
	document.body.replaceChildren();
	history.replaceState({}, '', '/');
});

type DecisionRow = {
	name: string;
	href: string | null;
	attributes?: Record<string, string>;
	event?: MouseEventInit;
	options?: LinkNavigationPolicyOptions;
	pathname?: string;
	expected: LinkNavigationDecision;
};

const intercepted = (href: string): LinkNavigationDecision => ({ shouldIntercept: true, href });
const ignored = (
	reason: Extract<LinkNavigationDecision, { shouldIntercept: false }>['reason'],
): LinkNavigationDecision => ({
	shouldIntercept: false,
	reason,
});

/**
 * The one table for the link interception policy shared by browser-router and react-router.
 *
 * @remarks
 * Each rejecting row uses an href that no other rule would reject, and the expected decision names
 * the reason, so removing one rule turns its row into a different reason instead of passing.
 * `/export` carries the download rows because `/file.pdf` is also a static asset.
 */
const decisionRows: DecisionRow[] = [
	{ name: 'same-origin page link', href: '/page', expected: intercepted('/page') },
	{
		name: 'relative path link on a nested page',
		href: 'next',
		pathname: '/docs/intro',
		expected: intercepted('/docs/next'),
	},
	{
		name: 'query-only link',
		href: '?page=2',
		pathname: '/blog',
		expected: intercepted('/blog?page=2'),
	},
	{
		name: 'parent-relative link',
		href: '../x',
		pathname: '/docs/guide/intro',
		expected: intercepted('/docs/x'),
	},
	{
		name: 'hash on another page resolved against the current page',
		href: 'other#part',
		pathname: '/docs/intro',
		expected: intercepted('/docs/other#part'),
	},
	{
		name: 'same-origin absolute URL',
		href: `${window.location.origin}/absolute-path`,
		expected: intercepted('/absolute-path'),
	},
	{ name: 'link with a query string', href: '/page?foo=bar&baz=qux', expected: intercepted('/page?foo=bar&baz=qux') },
	{ name: 'target _self', href: '/page', attributes: { target: '_self' }, expected: intercepted('/page') },
	{ name: 'hash on another page', href: '/other#section', expected: intercepted('/other#section') },
	{
		name: 'default reload attribute once a custom one is set',
		href: '/page',
		attributes: { 'data-eco-reload': '' },
		options: { reloadAttribute: 'data-full-reload' },
		expected: intercepted('/page'),
	},
	{ name: 'meta-click', href: '/page', event: { metaKey: true }, expected: ignored('modified-click') },
	{ name: 'ctrl-click', href: '/page', event: { ctrlKey: true }, expected: ignored('modified-click') },
	{ name: 'shift-click', href: '/page', event: { shiftKey: true }, expected: ignored('modified-click') },
	{ name: 'alt-click', href: '/page', event: { altKey: true }, expected: ignored('modified-click') },
	{ name: 'middle button', href: '/page', event: { button: 1 }, expected: ignored('non-left-click') },
	{ name: 'right button', href: '/page', event: { button: 2 }, expected: ignored('non-left-click') },
	{ name: 'target _blank', href: '/page', attributes: { target: '_blank' }, expected: ignored('external-target') },
	{ name: 'target _parent', href: '/page', attributes: { target: '_parent' }, expected: ignored('external-target') },
	{ name: 'target _top', href: '/page', attributes: { target: '_top' }, expected: ignored('external-target') },
	{ name: 'download', href: '/export', attributes: { download: '' }, expected: ignored('download') },
	{
		name: 'download with a file name',
		href: '/export',
		attributes: { download: 'report.csv' },
		expected: ignored('download'),
	},
	{
		name: 'reload attribute',
		href: '/logout',
		attributes: { 'data-eco-reload': '' },
		expected: ignored('explicit-reload'),
	},
	{
		name: 'custom reload attribute',
		href: '/logout',
		attributes: { 'data-full-reload': '' },
		options: { reloadAttribute: 'data-full-reload' },
		expected: ignored('explicit-reload'),
	},
	{
		name: 'no-prefetch attribute',
		href: '/page',
		attributes: { 'data-eco-no-prefetch': '' },
		expected: ignored('no-prefetch'),
	},
	{ name: 'hash-only link', href: '#section', expected: ignored('invalid-href') },
	{ name: 'javascript: link', href: 'javascript:void(0)', expected: ignored('invalid-href') },
	{ name: 'anchor without href', href: null, expected: ignored('invalid-href') },
	{ name: 'external site', href: 'https://example.com/page', expected: ignored('cross-origin') },
	{ name: 'same host on another port', href: 'http://localhost:9999/page', expected: ignored('cross-origin') },
	{ name: 'mailto: link', href: 'mailto:test@example.com', expected: ignored('cross-origin') },
	{ name: 'tel: link', href: 'tel:+1234567890', expected: ignored('cross-origin') },
	{ name: 'text static asset', href: '/skill.txt', expected: ignored('static-asset') },
	{ name: 'nested markdown asset', href: '/skill/reference/full-stack.md', expected: ignored('static-asset') },
	{ name: 'llms.txt', href: '/llms.txt', expected: ignored('static-asset') },
	{
		name: 'fragment of the current page',
		href: '/docs/page#section',
		pathname: '/docs/page',
		expected: ignored('same-page-hash'),
	},
];

describe('getLinkNavigationDecision', () => {
	it.each(decisionRows)('$name', ({ href, attributes, event, options, pathname, expected }) => {
		if (pathname) history.replaceState({}, '', pathname);
		const link = createLink(href, attributes);

		expect(getLinkNavigationDecision(createMouseEvent(event), link, { ...policy, ...options })).toEqual(expected);
	});
});

describe('getLinkNavigationDecision with a base element', () => {
	afterEach(() => {
		document.head.querySelector('base')?.remove();
	});

	it('resolves relative links against the base href like a full page load', () => {
		history.replaceState({}, '', '/blog');
		const base = document.createElement('base');
		base.href = `${window.location.origin}/docs/`;
		document.head.append(base);

		expect(getLinkNavigationDecision(createMouseEvent(), createLink('intro'), policy)).toEqual(
			intercepted('/docs/intro'),
		);
	});
});

describe('getNavigableHrefFromClick', () => {
	it('returns the href of an intercepted click and null for an ignored one', () => {
		expect(getNavigableHrefFromClick(createMouseEvent(), createLink('/page'), policy)).toBe('/page');
		expect(getNavigableHrefFromClick(createMouseEvent(), createLink('/llms.txt'), policy)).toBeNull();
	});
});

describe('isSamePageHashNavigationHref', () => {
	it('returns true for the current page with a fragment', () => {
		history.replaceState({}, '', '/docs/page');
		expect(isSamePageHashNavigationHref('/docs/page#section')).toBe(true);
		expect(isSamePageHashNavigationHref('/docs/page')).toBe(false);
		expect(isSamePageHashNavigationHref('/docs/other#section')).toBe(false);
	});
});

type PrefetchRow = {
	name: string;
	href: string;
	attributes?: Record<string, string>;
	pathname?: string;
	expected: boolean;
};

describe('shouldPrefetchLink', () => {
	const rows: PrefetchRow[] = [
		{ name: 'internal page link', href: '/docs/intro', expected: true },
		{ name: 'static asset', href: '/skill.txt', expected: false },
		{ name: 'no-prefetch opt-out', href: '/page', attributes: { 'data-eco-no-prefetch': '' }, expected: false },
		{ name: 'reload link', href: '/logout', attributes: { 'data-eco-reload': '' }, expected: false },
		{ name: 'cross-origin link', href: 'https://example.com/page', expected: false },
		{ name: 'download', href: '/export', attributes: { download: '' }, expected: false },
		{ name: 'current page', href: '/', expected: false },
		{
			name: 'query-only link to another query of the current page',
			href: '?page=2',
			pathname: '/blog',
			expected: true,
		},
		{ name: 'relative link to the current page', href: 'intro', pathname: '/docs/intro', expected: false },
	];

	it.each(rows)('$name', ({ href, attributes, pathname, expected }) => {
		if (pathname) history.replaceState({}, '', pathname);
		expect(shouldPrefetchLink(createLink(href, attributes), policy)).toBe(expected);
	});
});
