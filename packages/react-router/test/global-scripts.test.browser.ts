import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useRouter, type RouterContextValue } from '../src/context.ts';
import { EcoRouter, PageContent } from '../src/router.ts';
import {
	createMockPageComponent,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

type HookProbe = { __globalHook?: boolean; __globalHookAtImport?: boolean };

const probe = globalThis as HookProbe;

describe('EcoRouter global scripts', () => {
	const ctx = useRouterTestEnvironment();
	const moduleUrl = new URL('./fixtures/page-reading-global-hook.tsx', import.meta.url).toString();
	const hookScript = `data:text/javascript,${encodeURIComponent('globalThis.__globalHook = true;')}`;

	afterEach(() => {
		delete probe.__globalHook;
		delete probe.__globalHookAtImport;
		document.head.querySelectorAll('script[data-eco-script-id="global-hook"]').forEach((script) => script.remove());
	});

	async function mountRouter(): Promise<() => RouterContextValue> {
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
		return () => current as unknown as RouterContextValue;
	}

	it('runs the next document global scripts before it imports the Page module', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			htmlPageResponse(`<html data-eco-document-owner="react-router"><head>
				<script type="module" data-eco-global-script data-eco-script-id="global-hook" src="${hookScript}"></script>
			</head><body>
				<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
					schemaVersion: 1,
					navigationOwner: 'react-router',
					moduleUrl,
					props: {},
				})}</script>
			</body></html>`),
		);
		const router = await mountRouter();

		await router().navigate('/hook-reader');

		await waitUntil(() => expect(probe.__globalHookAtImport).toBeDefined());
		expect(probe.__globalHookAtImport).toBe(true);
	});
});
