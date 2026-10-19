import { describe, expect, it, vi } from 'vitest';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useRouter, type RouterContextValue } from '../src/context.ts';
import { EcoRouter, PageContent } from '../src/router.ts';
import {
	createMockPageComponent,
	createNavigablePageHtml,
	getRequestPath,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

describe('EcoRouter programmatic navigation', () => {
	const ctx = useRouterTestEnvironment();
	const moduleUrl = new URL('./fixtures/page-from-props.tsx', import.meta.url).toString();

	async function mountRouter(): Promise<{ router: () => RouterContextValue }> {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
			htmlPageResponse(createNavigablePageHtml(moduleUrl, { label: getRequestPath(input) }), { status: 200 }),
		);

		let current: RouterContextValue | null = null;
		const RouterProbe = () => {
			const router = useRouter();
			useEffect(() => {
				current = router;
			}, [router]);
			return null;
		};

		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: createMockPageComponent('Home'),
				pageProps: {},
				options: { viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement('div', null, createElement(PageContent), createElement(RouterProbe)),
			}),
		);
		await ctx.ready();
		await waitUntil(() => expect(current).not.toBeNull());
		return { router: () => current as unknown as RouterContextValue };
	}

	it('pushes a history entry and updates the URL', async () => {
		const { router } = await mountRouter();
		const lengthBefore = window.history.length;

		await router().navigate('/about?tab=team#section');

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: '/about' }));
		expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
			'/about?tab=team#section',
		);
		expect(window.history.length).toBe(lengthBefore + 1);
	});

	it('replaces the current history entry when asked to', async () => {
		const { router } = await mountRouter();
		const lengthBefore = window.history.length;

		await router().navigate('/about', { replace: true });

		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: '/about' }));
		expect(window.location.pathname).toBe('/about');
		expect(window.history.length).toBe(lengthBefore);
	});

	it('renders the previous page on back without adding a history entry', async () => {
		const { router } = await mountRouter();
		await router().navigate('/about');
		await waitUntil(() => expect(window.location.pathname).toBe('/about'));
		const lengthAfterPush = window.history.length;

		window.history.back();

		await waitUntil(() => expect(window.location.pathname).toBe('/'));
		await waitUntil(() => expect(window.__ECO_PAGES__?.page?.props).toEqual({ label: '/' }));
		expect(window.history.length).toBe(lengthAfterPush);
	});
});
