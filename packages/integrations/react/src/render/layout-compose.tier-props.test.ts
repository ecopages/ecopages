import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { eco } from '@ecopages/core';
import {
	composeLayoutPageTree,
	composeLayoutPageTreeFromShell,
	type ComposablePage,
	type LayoutShellEntry,
} from './layout-compose.ts';

type User = { name: string };

/** The wire contract: tiers are resolved on the server, serialized, and the browser composes from them. */
describe('layout composition from serialized tier props', () => {
	const Shell = ({ children, user }: { children?: ReactNode; user?: User }) =>
		createElement('div', { 'data-shell': true }, createElement('nav', null, user?.name ?? 'guest'), children);
	const Sidebar = ({ children, items }: { children?: ReactNode; items?: string[] }) =>
		createElement('aside', null, (items ?? []).join(','), children);

	function build() {
		const shellFactory = vi.fn(({ locals }: { locals?: Record<string, unknown> }) => {
			const session = locals?.session as { user: User };
			return { user: { name: session.user.name } };
		});
		const sidebarFactory = vi.fn(() => ({ items: ['a', 'b'] }));
		const Page = eco.page<{ id: string }, ReactNode>({
			layout: [
				{ component: Shell, props: shellFactory as never },
				{ component: Sidebar, props: sidebarFactory as never },
			],
			render: ({ id }) => createElement('main', null, `page ${id}`),
		}) as ComposablePage<{ id: string }>;
		return { Page, shellFactory, sidebarFactory };
	}

	// the request-scoped context only the server has, including a secret that must never be serialized
	const serverContext = {
		params: {},
		query: {},
		locals: { session: { user: { name: 'Ada' }, token: 'SECRET-TOKEN' } },
	};

	function resolveTiersOnServer(Page: ComposablePage<{ id: string }>): Record<string, unknown>[] {
		return (Page.config?.layoutEntries ?? []).map((entry) => (entry.props ? entry.props(serverContext) : {}));
	}

	it('renders in the browser exactly what the server rendered, without running a factory', () => {
		const { Page, shellFactory, sidebarFactory } = build();
		const tiers = resolveTiersOnServer(Page);
		const shellLayouts: LayoutShellEntry[] = (Page.config?.layoutEntries ?? []).map((entry, index) => ({
			component: entry.component,
			props: tiers[index],
		}));
		const serverHtml = renderToString(composeLayoutPageTreeFromShell(Page, { id: '7' }, shellLayouts));
		const payload = JSON.stringify({ tiers, props: { id: '7' } });
		expect(shellFactory).toHaveBeenCalledTimes(1);
		expect(sidebarFactory).toHaveBeenCalledTimes(1);

		const received = JSON.parse(payload) as { tiers: Record<string, unknown>[]; props: { id: string } };
		const browser = build();
		const browserHtml = renderToString(
			composeLayoutPageTree(browser.Page, received.props, { tierProps: received.tiers }),
		);

		expect(browserHtml).toBe(serverHtml);
		expect(browserHtml).toContain('Ada');
		expect(browserHtml).toContain('a,b');
		expect(browser.shellFactory).not.toHaveBeenCalled();
		expect(browser.sidebarFactory).not.toHaveBeenCalled();
	});

	it('puts only what each factory returned in the payload, never the request locals', () => {
		const { Page } = build();

		const payload = JSON.stringify({ tiers: resolveTiersOnServer(Page) });

		expect(payload).toContain('Ada');
		expect(payload).not.toContain('SECRET-TOKEN');
		expect(payload).not.toContain('session');
		expect(payload).not.toContain('locals');
	});

	it('composes a tier with no factory from empty props', () => {
		const Plain = ({ children }: { children?: ReactNode }) => createElement('section', null, children);
		const Page = eco.page<{}, ReactNode>({
			layout: [Plain],
			render: () => createElement('main', null, 'p'),
		}) as ComposablePage<Record<string, unknown>>;

		const html = renderToString(composeLayoutPageTree(Page, {}, { tierProps: [{}] }));

		expect(html).toContain('<section><main>p</main></section>');
	});

	it('keeps the existing behavior when no tier props are given', () => {
		const { Page, shellFactory } = build();

		const html = renderToString(
			composeLayoutPageTree(Page, { id: '7', locals: serverContext.locals }, { context: serverContext }),
		);

		expect(html).toContain('Ada');
		expect(shellFactory).toHaveBeenCalled();
	});
});
