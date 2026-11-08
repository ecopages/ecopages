import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, useEffect, useState, type ElementType, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { eco } from '@ecopages/core';
import { startPageHydration, type PageHydrationOptions } from './browser/page-hydration.ts';
import { getIslandHydrationRuntime, mountIslands } from './browser/island-hydration.ts';
import { foreignBoundary } from './browser/foreign-boundary.ts';
import { getForeignSubtreeKey, renderForeignSubtreeBoundary } from './foreign-subtree.ts';

type TestWindow = Window &
	typeof globalThis & { __ECO_PAGES__?: { page?: { module: string; props: object; document?: Document } } };

/** A Lit Component as the browser sees it: its render returns a Lit `TemplateResult`, which React cannot render. */
const LitCounter = eco.component<{ count: number }, unknown>({
	identity: { id: 'lit-counter', file: 'src/components/lit-counter.lit.tsx', integration: 'lit' },
	render: ({ count }) => ({ _$litType$: 1, strings: ['<lit-counter count="', '"></lit-counter>'], values: [count] }),
});

/** What the build gives a React module that imports the Lit Component. */
const LitCounterBoundary = foreignBoundary(LitCounter);

const SERVER_LIT_COUNTER = renderForeignSubtreeBoundary(
	getForeignSubtreeKey(LitCounter, { count: 1 }),
	'<!--lit-part--><lit-counter count="1"><template shadowrootmode="open"><span data-lit-value>1</span></template></lit-counter><!--/lit-part-->',
);

let islandRuntimeState: ReturnType<typeof getIslandHydrationRuntime> | undefined;

/**
 * The React runtime a generated entry passes to the bootstraps.
 *
 * @remarks
 * Records uncaught errors that no bootstrap handler takes, which React would otherwise report globally.
 */
function createReactRuntime(errors: unknown[]) {
	return {
		hydrateRoot: (target: HTMLElement, tree: unknown, options?: Parameters<typeof hydrateRoot>[2]) => {
			const root = hydrateRoot(target, tree as ReactNode, {
				onUncaughtError: (error) => errors.push(error),
				...options,
			});
			return { render: (nextTree: unknown) => root.render(nextTree as ReactNode), unmount: () => root.unmount() };
		},
		createElement: createElement as (...args: unknown[]) => unknown,
		useEffect,
	};
}

function ReactPage() {
	const [clicks, setClicks] = useState(0);
	useEffect(() => {
		document.body.dataset.hydrated = 'true';
	}, []);
	return createElement(
		'main',
		null,
		createElement('button', { type: 'button', onClick: () => setClicks(clicks + 1) }, String(clicks)),
		createElement(LitCounterBoundary as ElementType, { count: 1 }),
	);
}

function createPageOptions(errors: unknown[]): PageHydrationOptions {
	const options = {
		scriptId: 'ecopages-react-page',
		pageModuleUrl: '/assets/page.js',
		Page: ReactPage,
		pageDataReader: {
			readPageDataDocument: () => ({ props: {} }),
			getPageDataFromDocument: () => ({}),
		},
		runtime: createReactRuntime(errors),
		createTree: (Component: unknown, props: Record<string, unknown>) =>
			createElement(Component as ElementType, props),
		hasRouter: false,
		isMdx: false,
	};
	return options;
}

function trackErrors() {
	const errors: unknown[] = [];
	vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
	vi.spyOn(console, 'warn').mockImplementation((...args) => errors.push(args));
	vi.spyOn(globalThis, 'reportError').mockImplementation((error) => errors.push(error));
	return errors;
}

afterEach(() => {
	islandRuntimeState?.observer?.disconnect();
	islandRuntimeState = undefined;
	document.body.innerHTML = '';
	delete document.body.dataset.hydrated;
	document.querySelectorAll('script[data-eco-script-id]').forEach((node) => node.remove());
	delete (window as TestWindow).__ECO_PAGES__;
});

describe('Foreign Subtree in a hydrated React tree', () => {
	it('A hydrated React Page renders a foreign Lit Component', async () => {
		const errors = trackErrors();
		const script = document.createElement('script');
		script.setAttribute('data-eco-script-id', 'ecopages-react-page');
		document.head.appendChild(script);
		document.body.setHTMLUnsafe(`<main><button type="button">0</button>${SERVER_LIT_COUNTER}</main>`);
		const litCounter = document.querySelector('lit-counter')!;
		const button = document.querySelector('button')!;

		startPageHydration(createPageOptions(errors));
		await vi.waitFor(() => expect(document.body.dataset.hydrated).toBe('true'));
		button.click();

		await vi.waitFor(() => expect(button.textContent).toBe('1'));
		expect(button.isConnected).toBe(true);
		expect(document.querySelector('lit-counter')).toBe(litCounter);
		expect(litCounter.shadowRoot?.textContent).toBe('1');
		expect(errors).toEqual([]);
	});

	it('A hydrated React Island renders a foreign Lit Component', async () => {
		const errors = trackErrors();
		document.body.setHTMLUnsafe(
			`<eco-island style="display:contents" data-eco-island="" data-eco-component-key="island" data-eco-props="e30="><section><button type="button">0</button>${SERVER_LIT_COUNTER}</section></eco-island>`,
		);
		const litCounter = document.querySelector('lit-counter')!;
		const host = document.querySelector('eco-island')!;
		const button = document.querySelector('button')!;
		const Island = () => {
			const [clicks, setClicks] = useState(0);
			return createElement(
				'section',
				null,
				createElement('button', { type: 'button', onClick: () => setClicks(clicks + 1) }, String(clicks)),
				createElement(LitCounterBoundary as ElementType, { count: 1 }),
			);
		};
		islandRuntimeState = getIslandHydrationRuntime();

		mountIslands({
			targetSelector: '[data-eco-component-key="island"]',
			componentModule: { default: Island },
			scriptId: 'island',
			runtime: createReactRuntime(errors),
			runtimeState: islandRuntimeState,
		});
		await vi.waitFor(() => expect(host.getAttribute('data-eco-hydrated')).toBe('true'));
		button.click();

		await vi.waitFor(() => expect(button.textContent).toBe('1'));
		expect(document.querySelector('lit-counter')).toBe(litCounter);
		expect(litCounter.shadowRoot?.textContent).toBe('1');
		expect(errors).toEqual([]);
	});

	it('A client navigation renders a foreign Lit Component from the fetched document', () => {
		const errors = trackErrors();
		const key = getForeignSubtreeKey(LitCounter, { count: 1 });
		const fetched = new DOMParser().parseFromString(
			`<main>${renderForeignSubtreeBoundary(key, '<lit-counter count="1"><template shadowrootmode="open"><span>1</span></template></lit-counter>')}</main>`,
			'text/html',
		);
		((window as TestWindow).__ECO_PAGES__ ??= {}).page = {
			module: '/assets/next.js',
			props: {},
			document: fetched,
		};
		document.body.innerHTML = renderForeignSubtreeBoundary(key, '<lit-counter count="stale"></lit-counter>');
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);

		flushSync(() => root.render(createElement(ReactPage)));
		const litCounter = container.querySelector(`[data-eco-foreign-key="${key}"] > lit-counter`);
		flushSync(() => container.querySelector('button')!.click());

		expect(container.querySelector('button')?.textContent).toBe('1');
		expect(litCounter?.getAttribute('count')).toBe('1');
		expect(litCounter?.shadowRoot?.textContent).toBe('1');
		expect(litCounter?.querySelector('template')).toBeNull();
		expect(container.querySelector('lit-counter')).toBe(litCounter);
		expect(errors).toEqual([]);
		root.unmount();
	});
});
