import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, useEffect, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { eco, type LayoutProps } from '@ecopages/core';
import { createMiddleware } from '../../../../core/src/middleware/create-middleware.ts';
import { resolveDocumentShellLayouts } from '../../../../core/src/route-renderer/orchestration/document-shell/layout-shell-props.service.ts';
import {
	assertComposablePage,
	composeLayoutPageTree,
	composeLayoutPageTreeFromShell,
	type ComposablePage,
} from './layout-compose.ts';

/**
 * A Page whose layout entry is written inline and reads the Locals its middleware list provides: the server runs
 * the factory and ships the result as `tiers`, and the browser hydrates every tier from them.
 */
describe('a layout entry that reads typed locals, from server render to hydration', () => {
	let root: Root | undefined;
	let container: HTMLElement | undefined;

	afterEach(() => {
		root?.unmount();
		container?.remove();
		root = undefined;
		container = undefined;
	});

	type Session = { user: { name: string }; token: string };
	const session = createMiddleware((_ctx, next) =>
		next({ session: { user: { name: 'Ada' }, token: 'SECRET-TOKEN' } satisfies Session }),
	);

	const Shell = ({ children, user }: LayoutProps<ReactNode> & { user?: string }) =>
		createElement(
			'section',
			{ 'data-testid': 'shell' },
			createElement('span', { 'data-testid': 'user' }, user ?? 'guest'),
			children,
		);
	const Plain = ({ children }: LayoutProps<ReactNode>) => createElement('main', null, children);

	function build() {
		const factory = vi.fn((name: string) => ({ user: name }));
		const committed = vi.fn();
		const Content = () => {
			useEffect(() => committed(), []);
			return createElement('p', { 'data-testid': 'page' }, 'dashboard');
		};
		const Page = eco.page({
			cache: 'dynamic',
			middleware: [session],
			layout: [{ component: Shell, props: ({ locals }) => factory(locals.session.user.name) }, Plain],
			render: () => createElement(Content),
		});
		return { Page: assertComposablePage(Page), factory, committed };
	}

	/**
	 * @remarks
	 * Renders into a detached element instead of with `react-dom/server`, whose first import in a browser test makes
	 * Vite re-optimize dependencies and reload the run.
	 */
	function renderMarkup(tree: ReactNode): string {
		const target = document.createElement('div');
		const markupRoot = createRoot(target);
		flushSync(() => markupRoot.render(tree));
		const html = target.innerHTML;
		markupRoot.unmount();
		return html;
	}

	const requestLocals = { session: { user: { name: 'Ada' }, token: 'SECRET-TOKEN' } };

	function renderOnServer(Page: ComposablePage) {
		const layouts = resolveDocumentShellLayouts({
			layoutEntries: Page.config?.layoutEntries,
			params: {},
			query: {},
			locals: requestLocals,
		});
		const html = renderMarkup(composeLayoutPageTreeFromShell(Page, {}, layouts));
		const payload = JSON.stringify({ props: {}, tiers: layouts.map((layout) => layout.props ?? {}) });
		return { html, payload };
	}

	it('renders the layout with what the inline factory returned on the server', () => {
		const { Page, factory } = build();

		const { html, payload } = renderOnServer(Page);

		expect(factory).toHaveBeenCalledTimes(1);
		expect(html).toContain('Ada');
		expect(payload).toContain('"tiers":[{"user":"Ada"},{}]');
		expect(payload).not.toContain('SECRET-TOKEN');
	});

	it('hydrates every tier from the shipped tiers without a mismatch or a factory call', async () => {
		const server = build();
		const { html, payload } = renderOnServer(server.Page);
		const received = JSON.parse(payload) as { props: Record<string, unknown>; tiers: Record<string, unknown>[] };
		container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const onRecoverableError = vi.fn();
		const browser = build();

		root = hydrateRoot(
			container,
			composeLayoutPageTree(browser.Page, received.props, { tierProps: received.tiers }),
			{
				onRecoverableError,
			},
		);

		await vi.waitFor(() => expect(browser.committed).toHaveBeenCalled());
		expect(container.querySelector('[data-testid="page"]')?.textContent).toBe('dashboard');
		expect(container.querySelector('[data-testid="user"]')?.textContent).toBe('Ada');
		expect(container.querySelector('section > main > p')).not.toBeNull();
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(browser.factory).not.toHaveBeenCalled();
	});
});
