import { afterEach, describe, expect, it } from 'vitest';
import {
	getFormNavigationDecision,
	getLinkNavigationDecision,
	getNavigableHrefFromClick,
	isSamePageHashNavigationHref,
	shouldPrefetchLink,
	type FormNavigationDecision,
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

type FormRow = {
	name: string;
	/** The markup inside `<form>`, given its attributes by `form`. */
	html: string;
	form?: Record<string, string>;
	/** The selector of the control that submits; the form submits without a submitter when omitted. */
	submitter?: string;
	pathname?: string;
	/** Runs on the form's own submit listener, before the router's. */
	beforeDecision?: (event: SubmitEvent) => void;
	options?: LinkNavigationPolicyOptions;
	expected: FormNavigationDecision;
};

const formIntercepted = (href: string): FormNavigationDecision => ({ shouldIntercept: true, href });
const formIgnored = (
	reason: Extract<FormNavigationDecision, { shouldIntercept: false }>['reason'],
): FormNavigationDecision => ({ shouldIntercept: false, reason });

/**
 * Submits a form as the browser does, without leaving the page, and returns what the policy decides.
 *
 * @remarks
 * A dispatched `submit` event never submits the form, so the event only carries the submitter. The decision
 * is taken in a document bubble listener, where the router takes it, after the form's own listeners.
 */
function decideFormSubmission(row: FormRow): FormNavigationDecision {
	const form = document.createElement('form');
	for (const [key, value] of Object.entries(row.form ?? {})) form.setAttribute(key, value);
	form.innerHTML = row.html;
	document.body.append(form);
	if (row.pathname) history.replaceState({}, '', row.pathname);
	if (row.beforeDecision) form.addEventListener('submit', row.beforeDecision);

	let decision: FormNavigationDecision | null = null;
	document.addEventListener(
		'submit',
		(event) => {
			decision = getFormNavigationDecision(event as SubmitEvent, row.options ?? policy);
		},
		{ once: true },
	);
	const submitter = row.submitter ? form.querySelector<HTMLElement>(row.submitter) : null;
	form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }));

	if (!decision) throw new Error('The submit event never reached the document');
	return decision;
}

/**
 * The one table for the form submission policy: which `<form>` submissions become client navigations.
 *
 * @remarks
 * Each rejecting row differs from an intercepted row in one thing, so removing one rule turns its row into
 * an intercepted decision instead of passing.
 */
const formRows: FormRow[] = [
	{
		name: 'a GET form to a same-origin action',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair">',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'a form with no method, which is GET',
		form: { action: '/search' },
		html: '<input name="q" value="chair">',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'a method written in capitals',
		form: { action: '/search', method: 'GET' },
		html: '<input name="q" value="chair">',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'a form with no action, which submits to the current page and replaces its query',
		form: { method: 'get' },
		html: '<input name="q" value="chair">',
		pathname: '/blog?q=old&page=2',
		expected: formIntercepted('/blog?q=chair'),
	},
	{
		name: 'an action with its own query, which a GET submission replaces',
		form: { action: '/search?x=1', method: 'get' },
		html: '<input name="q" value="chair">',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'an action with a fragment, which stays',
		form: { action: '/search#results', method: 'get' },
		html: '<input name="q" value="chair">',
		expected: formIntercepted('/search?q=chair#results'),
	},
	{
		name: 'a relative action on a nested page',
		form: { action: 'results', method: 'get' },
		html: '<input name="q" value="chair">',
		pathname: '/docs/intro',
		expected: formIntercepted('/docs/results?q=chair'),
	},
	{
		name: 'a form with no fields, which leaves an empty query',
		form: { action: '/search', method: 'get' },
		html: '',
		expected: formIntercepted('/search'),
	},
	{
		name: 'fields serialized as the browser does: spaces, empty values, repeated names',
		form: { action: '/search', method: 'get' },
		html: `
			<input name="q" value="a chair & more">
			<input name="min" value="">
			<input type="checkbox" name="material" value="oak" checked>
			<input type="checkbox" name="material" value="ash" checked>
			<input type="checkbox" name="material" value="pine">
			<input name="off" value="x" disabled>`,
		expected: formIntercepted('/search?q=a+chair+%26+more&min=&material=oak&material=ash'),
	},
	{
		name: 'a file field, which a GET form sends as its file name',
		form: { action: '/search', method: 'get' },
		html: '<input type="file" name="attachment">',
		expected: formIntercepted('/search?attachment='),
	},
	{
		name: 'the name and value of the button that submitted',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair"><button name="sort" value="asc">Asc</button><button name="sort" value="desc">Desc</button>',
		submitter: 'button[value="desc"]',
		expected: formIntercepted('/search?q=chair&sort=desc'),
	},
	{
		name: 'a submitter with its own formaction',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair"><button formaction="/shop">Shop</button>',
		submitter: 'button',
		expected: formIntercepted('/shop?q=chair'),
	},
	{
		name: 'a submitter that makes a POST form a GET',
		form: { action: '/search', method: 'post' },
		html: '<input name="q" value="chair"><button formmethod="get">Search</button>',
		submitter: 'button',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'a POST form',
		form: { action: '/cart', method: 'post' },
		html: '<input name="q" value="chair">',
		expected: formIgnored('non-get-method'),
	},
	{
		name: 'a dialog form',
		form: { method: 'dialog' },
		html: '<input name="q" value="chair">',
		expected: formIgnored('non-get-method'),
	},
	{
		name: 'a submitter that makes a GET form a POST',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair"><button formmethod="post">Send</button>',
		submitter: 'button',
		expected: formIgnored('non-get-method'),
	},
	{
		name: 'a target other than _self',
		form: { action: '/search', method: 'get', target: '_blank' },
		html: '<input name="q" value="chair">',
		expected: formIgnored('external-target'),
	},
	{
		name: 'a submitter with another formtarget',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair"><button formtarget="_blank">Search</button>',
		submitter: 'button',
		expected: formIgnored('external-target'),
	},
	{
		name: 'a target of _self',
		form: { action: '/search', method: 'get', target: '_self' },
		html: '<input name="q" value="chair">',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'the reload attribute on the form',
		form: { action: '/search', method: 'get', 'data-eco-reload': '' },
		html: '<input name="q" value="chair">',
		expected: formIgnored('explicit-reload'),
	},
	{
		name: 'the reload attribute on the submitter',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair"><button data-eco-reload>Search</button>',
		submitter: 'button',
		expected: formIgnored('explicit-reload'),
	},
	{
		name: 'a configured reload attribute',
		form: { action: '/search', method: 'get', 'data-full-reload': '' },
		html: '<input name="q" value="chair">',
		options: { reloadAttribute: 'data-full-reload' },
		expected: formIgnored('explicit-reload'),
	},
	{
		name: 'a cross-origin action',
		form: { action: 'https://example.com/search', method: 'get' },
		html: '<input name="q" value="chair">',
		expected: formIgnored('cross-origin'),
	},
	{
		name: 'a static asset action',
		form: { action: '/results.json', method: 'get' },
		html: '<input name="q" value="chair">',
		expected: formIgnored('static-asset'),
	},
	{
		name: 'an empty formaction, which is the current page and not the action of the form',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair"><button formaction="">Search</button>',
		submitter: 'button',
		pathname: '/blog',
		expected: formIntercepted('/blog?q=chair'),
	},
	{
		name: 'a formmethod that is not a method, which is GET and not the method of the form',
		form: { action: '/search', method: 'post' },
		html: '<input name="q" value="chair"><button formmethod="bogus">Search</button>',
		submitter: 'button',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'an empty formtarget, which is the current page and not the target of the form',
		form: { action: '/search', method: 'get', target: '_blank' },
		html: '<input name="q" value="chair"><button formtarget="">Search</button>',
		submitter: 'button',
		expected: formIntercepted('/search?q=chair'),
	},
	{
		name: 'controls named action and method, which shadow the properties of the form',
		form: { action: '/search', method: 'get' },
		html: '<input name="method" value="x"><input name="action" value="y">',
		expected: formIntercepted('/search?method=x&action=y'),
	},
	{
		name: 'a textarea, whose line breaks are sent as CRLF',
		form: { action: '/search', method: 'get' },
		html: '<textarea name="note">a\nb</textarea>',
		expected: formIntercepted('/search?note=a%0D%0Ab'),
	},
	{
		name: 'a submission another handler already cancelled',
		form: { action: '/search', method: 'get' },
		html: '<input name="q" value="chair">',
		beforeDecision: (event) => event.preventDefault(),
		expected: formIgnored('default-prevented'),
	},
];

describe('getFormNavigationDecision', () => {
	it.each(formRows)('$name', (row) => {
		expect(decideFormSubmission(row)).toEqual(row.expected);
	});

	it('resolves a relative action against the base element, as a full page load would', () => {
		const base = document.createElement('base');
		base.href = `${window.location.origin}/shop/`;
		document.head.append(base);
		try {
			expect(
				decideFormSubmission({
					form: { action: 'results', method: 'get' },
					html: '<input name="q" value="chair">',
					pathname: '/docs/intro',
					name: 'base',
					expected: formIntercepted('/shop/results?q=chair'),
				}),
			).toEqual(formIntercepted('/shop/results?q=chair'));
		} finally {
			base.remove();
		}
	});

	it('ignores an event whose target is not a form', () => {
		const event = new SubmitEvent('submit', { cancelable: true });
		Object.defineProperty(event, 'target', { value: document.body });

		expect(getFormNavigationDecision(event, policy)).toEqual(formIgnored('not-a-form'));
	});
});
