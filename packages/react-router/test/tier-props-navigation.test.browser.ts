import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useRouter, type RouterContextValue } from '../src/context.ts';
import { extractTierProps } from '../src/navigation.ts';
import { EcoRouter, PageContent } from '../src/router.ts';
import {
	createMockPageComponent,
	createNavigablePageHtml,
	getRequestPath,
	htmlPageResponse,
	useRouterTestEnvironment,
	waitUntil,
} from './react-router.harness.ts';

type Recorder = { factoryCalls: number };
const recorderHost = globalThis as { __ecoTierRecorder?: Recorder };

describe('EcoRouter navigation with server-resolved tier props', () => {
	const ctx = useRouterTestEnvironment();
	const moduleUrl = new URL('./fixtures/page-with-layout.tsx', import.meta.url).toString();

	beforeEach(() => {
		recorderHost.__ecoTierRecorder = { factoryCalls: 0 };
	});

	afterEach(() => {
		delete recorderHost.__ecoTierRecorder;
	});

	async function mountRouter(documents: Record<string, string>): Promise<() => RouterContextValue> {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
			htmlPageResponse(documents[getRequestPath(input)] ?? '', { status: 200 }),
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
		return () => current as unknown as RouterContextValue;
	}

	it('renders the layout of a navigated page from the fetched tiers and publishes them', async () => {
		const router = await mountRouter({
			'/with-tiers': createNavigablePageHtml(moduleUrl, {}, [{ user: 'Ada' }]),
		});

		await router().navigate('/with-tiers');

		await expect.element(page.getByTestId('user')).toHaveTextContent('Ada');
		expect(window.__ECO_PAGES__?.page?.tiers).toEqual([{ user: 'Ada' }]);
		expect(recorderHost.__ecoTierRecorder?.factoryCalls).toBe(0);
	});

	it('falls back to the layout factory when the navigated document carries no tiers', async () => {
		const router = await mountRouter({
			'/with-tiers': createNavigablePageHtml(moduleUrl, {}, [{ user: 'Ada' }]),
			'/without-tiers': createNavigablePageHtml(moduleUrl, {}),
		});
		await router().navigate('/with-tiers');
		await expect.element(page.getByTestId('user')).toHaveTextContent('Ada');

		await router().navigate('/without-tiers');

		await expect.element(page.getByTestId('user')).toHaveTextContent('factory');
		expect(window.__ECO_PAGES__?.page?.tiers).toBeUndefined();
		expect(recorderHost.__ecoTierRecorder!.factoryCalls).toBeGreaterThan(0);
	});

	describe('extractTierProps', () => {
		it('reads the tiers of a fetched document and of the live page state', () => {
			const doc = new DOMParser().parseFromString(
				createNavigablePageHtml('/p.js', {}, [{ user: 'Ada' }]),
				'text/html',
			);
			expect(extractTierProps(doc)).toEqual([{ user: 'Ada' }]);

			window.__ECO_PAGES__ = { page: { module: '/p.js', props: {}, tiers: [{ user: 'Live' }] } };
			expect(extractTierProps(document)).toEqual([{ user: 'Live' }]);
		});

		it('returns undefined when the document carries none or invalid ones', () => {
			const none = new DOMParser().parseFromString(createNavigablePageHtml('/p.js', {}), 'text/html');
			expect(extractTierProps(none)).toBeUndefined();
			const invalid = new DOMParser().parseFromString(
				createNavigablePageHtml('/p.js', {}, 'nope' as unknown as Record<string, unknown>[]),
				'text/html',
			);
			expect(extractTierProps(invalid)).toBeUndefined();
		});
	});
});
