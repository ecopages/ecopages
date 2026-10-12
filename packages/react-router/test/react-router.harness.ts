import { afterEach, beforeEach, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, createElement, type ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { getEcoNavigationRuntime } from '@ecopages/core/router/navigation-coordinator';
import { clearNavigationHtmlCache } from '../../core/src/router/client/navigation-document.ts';
import { clearLayoutCache } from '../src/router.ts';

export function htmlPageResponse(body: string, init: ResponseInit = {}): Response {
	return new Response(body, {
		status: 200,
		...init,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			...(init.headers ?? {}),
		},
	});
}

export function getRequestPath(input: RequestInfo | URL): string {
	const href = input instanceof Request ? input.url : input.toString();
	return new URL(href, window.location.href).pathname;
}

export function createMockPageComponent(name: string) {
	const Component = () => createElement('div', { 'data-testid': name }, `Page: ${name}`);
	Component.displayName = name;
	return Component;
}

export function createLayoutAwarePage(name: string) {
	const Layout = ({
		children,
		locals,
	}: {
		children: ReactNode;
		locals?: { session?: { user?: { name?: string } } };
	}) =>
		createElement(
			'div',
			{ 'data-testid': `${name}-layout` },
			`${locals?.session?.user?.name ?? 'anonymous'}`,
			children,
		);

	const Page = ((_props: { locals?: { session?: { user?: { name?: string } } } }) =>
		createElement('div', { 'data-testid': `${name}-page` }, name)) as ReturnType<typeof createMockPageComponent> & {
		config?: { layout?: typeof Layout };
	};

	Page.displayName = name;
	Page.config = { layouts: [Layout] };
	return Page;
}

export function createPageWithNamedLayout(name: string, layoutLabel: string, layoutKey: string) {
	const Layout = ({ children }: { children: ReactNode }) =>
		createElement('div', { 'data-testid': `${name}-layout` }, layoutLabel, children);

	Layout.displayName = `${layoutKey}-layout`;
	(Layout as typeof Layout & { config?: { identity?: { id: string } } }).config = {
		identity: { id: layoutKey },
	};

	const Page = (() => createElement('div', { 'data-testid': `${name}-page` }, name)) as ReturnType<
		typeof createMockPageComponent
	> & {
		config?: { layout?: typeof Layout };
	};

	Page.displayName = name;
	Page.config = { layouts: [Layout] };
	return Page;
}

export function createPageWithCollidingDisplayNameLayout(name: string, layoutTestId: string, layoutLabel: string) {
	const Layout = ({ children }: { children: ReactNode }) =>
		createElement('section', { 'data-testid': layoutTestId }, layoutLabel, children);

	Layout.displayName = 'layout';

	const Page = (() => createElement('div', { 'data-testid': `${name}-page` }, name)) as ReturnType<
		typeof createMockPageComponent
	> & {
		config?: { layout?: typeof Layout };
	};

	Page.displayName = name;
	Page.config = { layouts: [Layout] };
	return Page;
}

export function createEcoComponentStyleLayout(layoutTestId: string, options: { file: string; stylesheets?: string[] }) {
	const Layout = (({ children }: { children: ReactNode }) =>
		createElement('div', { 'data-testid': layoutTestId, className: 'eco-layout' }, children)) as ReturnType<
		typeof createMockPageComponent
	> & {
		config?: {
			identity?: { id: string; file: string; integration: string };
			dependencies?: {
				stylesheets?: string[];
			};
		};
	};

	Layout.config = {
		identity: { id: layoutTestId, file: options.file, integration: 'react' },
		dependencies: {
			stylesheets: options.stylesheets,
		},
	};

	return Layout;
}

export function createPageWithEcoComponentLayout(
	name: string,
	layoutTestId: string,
	options: { file: string; stylesheets?: string[] },
) {
	const Layout = createEcoComponentStyleLayout(layoutTestId, options);
	const Page = (() => createElement('div', { 'data-testid': `${name}-page` }, name)) as ReturnType<
		typeof createMockPageComponent
	> & {
		config?: { layout?: typeof Layout };
	};

	Page.displayName = name;
	Page.config = { layouts: [Layout] };
	return Page;
}

export function createMultiLinkPage(name: string, links: Array<{ href: string; label: string }>) {
	const Component = () =>
		createElement(
			'div',
			{ 'data-testid': `${name}-page` },
			...links.map((link) =>
				createElement(
					'a',
					{ key: link.href, href: link.href, 'data-testid': `${name}-${link.label}` },
					link.label,
				),
			),
		);
	Component.displayName = name;
	return Component;
}

export function createNavigablePageHtml(moduleUrl: string, props: Record<string, unknown> = {}) {
	return `<html data-eco-document-owner="react-router"><body>
		<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
			schemaVersion: 1,
			navigationOwner: 'react-router',
			moduleUrl,
			props,
		})}</script>
	</body></html>`;
}

export function createDeferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

/**
 * Runs `assertion` until it stops throwing, polling every millisecond.
 *
 * @remarks
 * `vi.waitFor` polls every 50 ms by default, which is most of the wait for state that is ready within a frame.
 */
export function waitUntil(assertion: () => unknown, timeout = 2000): Promise<unknown> {
	return vi.waitFor(assertion, { interval: 1, timeout });
}

/** Resolves once a mounted router has registered itself as the navigation owner. */
export async function waitForRouterOwner(): Promise<void> {
	await waitUntil(() => expect(getEcoNavigationRuntime(window).getOwnerState().owner).toBe('react-router'));
}

/**
 * Resolves after the browser has run every task queued before the call.
 *
 * @remarks
 * For asserting that something did not happen. A message-channel round trip runs after all pending
 * promise reactions without a timer, so it cannot be mistaken for waiting out a delay.
 */
export function flushTasks(): Promise<void> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
}

/**
 * Runs `render` and returns once React has committed it and run the resulting effects.
 *
 * @remarks
 * For asserting that a render did not change anything, where there is no element to wait for. `act` only
 * flushes while `IS_REACT_ACT_ENVIRONMENT` is set, so the flag is set for the call alone: left on, every
 * unrelated state update in the router would log a warning.
 */
export async function renderAndFlushEffects(render: () => void): Promise<void> {
	const scope = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
	const previous = scope.IS_REACT_ACT_ENVIRONMENT;
	scope.IS_REACT_ACT_ENVIRONMENT = true;
	try {
		await act(async () => render());
	} finally {
		scope.IS_REACT_ACT_ENVIRONMENT = previous;
	}
}

export type RouterTestEnvironment = {
	container: HTMLDivElement;
	root: Root;
	user: ReturnType<typeof userEvent.setup>;
	/** Resolves once the mounted router has registered itself as the navigation owner. */
	ready: typeof waitForRouterOwner;
};

/**
 * Registers the hooks that give each test a fresh container, history entry and navigation caches, and
 * unmounts the router afterwards. Call it inside `describe`.
 */
export function useRouterTestEnvironment(): RouterTestEnvironment {
	const ctx = { ready: waitForRouterOwner } as RouterTestEnvironment;

	beforeEach(() => {
		window.history.replaceState(null, '', '/');
		clearNavigationHtmlCache();
		ctx.container = document.createElement('div');
		document.body.appendChild(ctx.container);
		ctx.user = userEvent.setup();
	});

	afterEach(() => {
		ctx.root?.unmount();
		ctx.container?.remove();
		vi.restoreAllMocks();
		clearNavigationHtmlCache();
		clearLayoutCache();
		delete window.__ECO_PAGES__;
		delete (window as typeof window & { __ecoLayoutCache?: unknown }).__ecoLayoutCache;
	});

	return ctx;
}
