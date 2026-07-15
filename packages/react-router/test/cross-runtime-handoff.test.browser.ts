import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
	ECO_DOCUMENT_OWNER_ATTRIBUTE,
	getEcoDocumentOwner,
	getEcoNavigationRuntime,
} from '@ecopages/core/router/navigation-coordinator';
import { EcoRouter, PageContent, clearLayoutCache } from '../src/router.ts';

/**
 * Black-box cross-runtime navigation handoff tests.
 *
 * browser-router → react-router is covered by
 * `packages/browser-router/test/eco-router.lifecycle.test.browser.ts`
 * ("should swap directly into a React-owned document when document ownership changes").
 */

const PAGE_DATA_SCRIPT_ID = '__ECO_PAGE_DATA__';

function htmlPageResponse(body: string, init: ResponseInit = {}): Response {
	return new Response(body, {
		status: 200,
		...init,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			...(init.headers ?? {}),
		},
	});
}

function createLinkPage(name: string, href: string, label: string) {
	const Component = () =>
		createElement(
			'div',
			{ 'data-testid': `${name}-page` },
			createElement('a', { href, 'data-testid': `${name}-link` }, label),
		);
	Component.displayName = name;
	return Component;
}

describe('React ↔ browser-router cross-runtime handoff', () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		user = userEvent.setup();
	});

	afterEach(() => {
		root?.unmount();
		container.parentNode?.removeChild(container);
		vi.restoreAllMocks();
		clearLayoutCache();
		delete window.__ECO_PAGES__;
		delete (window as typeof window & { __ecoLayoutCache?: unknown }).__ecoLayoutCache;
	});

	describe('React → browser-router', () => {
		it('delegates fetched non-React documents through the shared coordinator', async () => {
			const outsideHtml = '<html><body><main>Outside React</main></body></html>';
			const handoffSpy = vi.fn(async () => true);
			const unregisterBrowserRouter = getEcoNavigationRuntime(window).register({
				owner: 'browser-router',
				handoffNavigation: handoffSpy,
			});

			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlPageResponse(outsideHtml));

			const Page = createLinkPage('LeaveReact', '/outside-react', 'outside');
			root = createRoot(container);
			root.render(
				createElement(EcoRouter, {
					page: Page,
					pageProps: {},
					options: { viewTransitions: false },
					// oxlint-disable-next-line no-children-prop
					children: createElement(PageContent),
				}),
			);

			await vi.waitFor(() => {
				expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router');
			});

			const link = container.querySelector('[data-testid="LeaveReact-link"]') as HTMLAnchorElement | null;
			expect(link).not.toBeNull();
			await user.click(link as HTMLAnchorElement);

			await vi.waitFor(() => {
				expect(handoffSpy).toHaveBeenCalledTimes(1);
			});

			const handoffRequest = handoffSpy.mock.calls[0]?.[0];
			expect(handoffRequest).toEqual(
				expect.objectContaining({
					href: '/outside-react',
					finalHref: '/outside-react',
					direction: 'forward',
					source: 'react-router',
					targetOwner: 'browser-router',
					document: expect.any(Document),
					html: outsideHtml,
				}),
			);

			const handedOffDocument = handoffRequest?.document as Document;
			expect(getEcoDocumentOwner(handedOffDocument)).toBeNull();
			expect(handedOffDocument.documentElement.hasAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE)).toBe(false);
			expect(handedOffDocument.getElementById(PAGE_DATA_SCRIPT_ID)).toBeNull();
			expect(handedOffDocument.body.innerHTML).toContain('Outside React');

			unregisterBrowserRouter();
		});
	});
});
