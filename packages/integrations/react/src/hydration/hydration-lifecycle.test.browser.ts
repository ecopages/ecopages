import { afterEach, describe, expect, it } from 'vitest';
import { createElement, useEffect, type ElementType, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { mountIslands, updateIslands, type IslandHydrationRuntime } from './browser/island-hydration.ts';
import { startPageHydration, type PageHydrationOptions } from './browser/page-hydration.ts';

type TestHydrationRegistration = {
	owner: string;
	cleanupBeforeHandoff: () => Promise<void>;
};

type TestHydrationRuntime = {
	hydrateCalls: Array<{
		containerTag: string;
		hasRecoverableErrorHandler: boolean;
		tree: unknown;
	}>;
	renderCalls: unknown[];
	claimedOwners: string[];
	releasedOwners: string[];
	registrations: TestHydrationRegistration[];
	unmountCount: number;
};

type TestWindow = Window &
	typeof globalThis & {
		__ECO_REACT_HYDRATION_TEST__?: TestHydrationRuntime;
		__ECO_PAGES__?: {
			navigation?: {
				getOwnerState?: () => { owner: string; canHandleSpaNavigation: boolean };
				register?: (registration: TestHydrationRegistration) => void;
				claimOwnership?: (owner: string) => void;
				releaseOwnership?: (owner: string) => void;
			};
			hmrHandlers?: Record<string, (url: string) => Promise<void>>;
			react?: {
				pageRoot?: { render: (tree: unknown) => void; unmount: () => void } | null;
				cleanupPageRoot?: () => void;
			};
			page?: { module: string; props: unknown };
			rerunScripts?: Record<string, () => unknown>;
		};
	};

function createPageOptions(
	testWindow: TestWindow,
	router: boolean,
	pageRoot?: { render: (tree: unknown) => void; unmount: () => void },
): PageHydrationOptions {
	const runtime = testWindow.__ECO_REACT_HYDRATION_TEST__!;
	const Page = () => null;
	const reactRuntime = {
		hydrateRoot: (
			target: HTMLElement,
			tree: unknown,
			options?: { onRecoverableError?: (error: unknown) => void },
		) => {
			runtime.hydrateCalls.push({
				containerTag: target.tagName,
				hasRecoverableErrorHandler: typeof options?.onRecoverableError === 'function',
				tree,
			});
			return (
				pageRoot ?? {
					render: (nextTree: unknown) => runtime.renderCalls.push(nextTree),
					unmount: () => {
						runtime.unmountCount += 1;
					},
				}
			);
		},
		createElement: (...args: unknown[]) => ({ args }),
	};

	return {
		scriptId: 'ecopages-react-page',
		pageModuleUrl: '/assets/page.js',
		Page,
		pageDataReader: {
			readPageDataDocument: () => ({ props: { title: 'Hello React', locals: { theme: 'dark' } } }),
			getPageDataFromDocument: () => ({ title: 'Hello React' }),
		},
		runtime: reactRuntime,
		createTree: (Component, props) => ({ Component, props }),
		hasRouter: router,
		isMdx: false,
	};
}

describe('React page lifecycle', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		delete (window as TestWindow).__ECO_PAGES__;
		delete (window as TestWindow).__ECO_REACT_HYDRATION_TEST__;
	});

	it('registers router ownership and cleanup', async () => {
		const testWindow = window as TestWindow;
		const testState: TestHydrationRuntime = {
			hydrateCalls: [],
			renderCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		testWindow.__ECO_REACT_HYDRATION_TEST__ = testState;
		testWindow.__ECO_PAGES__ = {
			navigation: {
				getOwnerState: () => ({ owner: 'html', canHandleSpaNavigation: false }),
				register: (registration) => testState.registrations.push(registration),
				claimOwnership: (owner) => testState.claimedOwners.push(owner),
				releaseOwnership: (owner) => testState.releasedOwners.push(owner),
			},
		};
		document.body.innerHTML = '<script data-eco-script-id="ecopages-react-page"></script>';

		startPageHydration(createPageOptions(testWindow, true));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(testState.hydrateCalls).toHaveLength(1);
		expect(testState.hydrateCalls[0].containerTag).toBe('BODY');
		expect(testState.hydrateCalls[0].hasRecoverableErrorHandler).toBe(true);
		expect(testState.claimedOwners).toEqual(['react-router']);
		expect(testState.registrations).toHaveLength(1);
		expect(typeof testWindow.__ECO_PAGES__?.react?.cleanupPageRoot).toBe('function');

		await testWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();

		expect(testState.unmountCount).toBe(1);
		expect(testState.releasedOwners).toEqual(['react-router']);
		expect(testWindow.__ECO_PAGES__?.page).toBeUndefined();
		expect(testWindow.__ECO_PAGES__?.react?.pageRoot).toBeNull();
	});

	it('reuses an existing router-owned page root on rerun', async () => {
		const testWindow = window as TestWindow;
		testWindow.__ECO_REACT_HYDRATION_TEST__ = {
			hydrateCalls: [],
			renderCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		const existingRoot = {
			render: (tree: unknown) => testWindow.__ECO_REACT_HYDRATION_TEST__?.renderCalls.push(tree),
			unmount: () => {
				testWindow.__ECO_REACT_HYDRATION_TEST__!.unmountCount += 1;
			},
		};
		testWindow.__ECO_PAGES__ = {
			navigation: {
				getOwnerState: () => ({ owner: 'react-router', canHandleSpaNavigation: true }),
			},
			react: { pageRoot: existingRoot },
		};
		document.body.innerHTML = '<script data-eco-script-id="ecopages-react-page"></script>';

		startPageHydration(createPageOptions(testWindow, true, existingRoot));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls).toHaveLength(0);
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.renderCalls).toHaveLength(0);
		expect(testWindow.__ECO_PAGES__?.react?.pageRoot).toBe(existingRoot);
	});

	it('coalesces concurrent startup and cancels a preload after cleanup', async () => {
		const testWindow = window as TestWindow;
		testWindow.__ECO_REACT_HYDRATION_TEST__ = {
			hydrateCalls: [],
			renderCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		document.body.innerHTML = '<script data-eco-script-id="ecopages-react-page"></script>';
		let resolvePreload!: () => void;
		const preload = new Promise<void>((resolve) => {
			resolvePreload = resolve;
		});
		const options = createPageOptions(testWindow, false);
		options.preload = () => preload;
		options.hmr = { importPath: '/assets/page.js' };

		startPageHydration(options);
		expect(typeof testWindow.__ECO_PAGES__?.hmrHandlers?.['/assets/page.js']).toBe('function');
		const rerun = testWindow.__ECO_PAGES__?.rerunScripts?.['ecopages-react-page'];
		rerun?.();
		await Promise.resolve();
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls).toHaveLength(0);

		await testWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();
		resolvePreload();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls).toHaveLength(0);
	});

	it('ignores an HMR update that settles after navigation cleanup', async () => {
		const testWindow = window as TestWindow;
		testWindow.__ECO_REACT_HYDRATION_TEST__ = {
			hydrateCalls: [],
			renderCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		document.body.innerHTML = '<script data-eco-script-id="ecopages-react-page"></script>';
		const options = createPageOptions(testWindow, false);
		options.hmr = { importPath: '/assets/page.js' };
		startPageHydration(options);
		await new Promise((resolve) => setTimeout(resolve, 0));

		let resolveUpdate!: () => void;
		(globalThis as Record<string, unknown>).__ECO_TEST_HMR_RELEASE__ = new Promise<void>((resolve) => {
			resolveUpdate = resolve;
		});
		const source = [
			'export default function UpdatedPage() {}',
			'export async function preload() {',
			'  await globalThis.__ECO_TEST_HMR_RELEASE__',
			'}',
		].join('\n');
		const hmrHandler = testWindow.__ECO_PAGES__?.hmrHandlers?.['/assets/page.js'];
		expect(hmrHandler).toBeDefined();
		const update = hmrHandler?.(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
		await new Promise((resolve) => setTimeout(resolve, 0));

		await testWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();
		const replacementRoot = {
			render: (tree: unknown) => testWindow.__ECO_REACT_HYDRATION_TEST__?.renderCalls.push(tree),
			unmount: () => undefined,
		};
		testWindow.__ECO_PAGES__!.react!.pageRoot = replacementRoot;
		resolveUpdate();
		await update;
		await hmrHandler?.('data:text/javascript,export default function RemovedPage() {}');

		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.renderCalls).toHaveLength(0);
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.unmountCount).toBe(1);
		delete (globalThis as Record<string, unknown>).__ECO_TEST_HMR_RELEASE__;
	});

	it('restores HMR handler with updated generation on page reactivation after cleanup', async () => {
		const testWindow = window as TestWindow;
		testWindow.__ECO_REACT_HYDRATION_TEST__ = {
			hydrateCalls: [],
			renderCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		document.body.innerHTML = '<script data-eco-script-id="ecopages-react-page"></script>';
		const options = createPageOptions(testWindow, false);
		options.hmr = { importPath: '/assets/page.js' };

		startPageHydration(options);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls).toHaveLength(1);

		const initialHmr = testWindow.__ECO_PAGES__?.hmrHandlers?.['/assets/page.js'];
		expect(initialHmr).toBeDefined();

		await testWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.unmountCount).toBe(1);

		await initialHmr?.('data:text/javascript,export default function IgnoredPage() {}');
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.renderCalls).toHaveLength(0);

		await testWindow.__ECO_PAGES__!.rerunScripts!['ecopages-react-page']!();
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls).toHaveLength(2);

		const restoredHmr = testWindow.__ECO_PAGES__?.hmrHandlers?.['/assets/page.js'];
		expect(restoredHmr).toBeDefined();

		await restoredHmr?.('data:text/javascript,export default function UpdatedPage() {}');
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.renderCalls).toHaveLength(1);
	});

	it('publishes a replacement only after its preload completes', async () => {
		const testWindow = window as TestWindow;
		testWindow.__ECO_REACT_HYDRATION_TEST__ = {
			hydrateCalls: [],
			renderCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		document.body.innerHTML = '<script data-eco-script-id="ecopages-react-page"></script>';
		let releaseInitial!: () => void;
		let releaseUpdate!: () => void;
		let signalUpdate!: () => void;
		const initialPreload = new Promise<void>((resolve) => {
			releaseInitial = resolve;
		});
		const updateStarted = new Promise<void>((resolve) => {
			signalUpdate = resolve;
		});
		const updatePreload = new Promise<void>((resolve) => {
			releaseUpdate = resolve;
		});
		const testGlobals = globalThis as Record<string, unknown>;
		testGlobals.__ECO_TEST_PENDING_PRELOAD__ = () => {
			signalUpdate();
			return updatePreload;
		};
		const options = createPageOptions(testWindow, false);
		const initialPage = options.Page;
		options.preload = () => initialPreload;
		options.hmr = { importPath: '/assets/page.js' };
		try {
			startPageHydration(options);
			const handler = testWindow.__ECO_PAGES__!.hmrHandlers!['/assets/page.js']!;
			const source =
				'export default function ReadyPage() {} export const preload = () => globalThis.__ECO_TEST_PENDING_PRELOAD__();';
			const update = handler(`data:text/javascript,${encodeURIComponent(source)}`);
			await updateStarted;
			expect(options.Page).toBe(initialPage);
			releaseInitial();
			await testWindow.__ECO_PAGES__!.rerunScripts!['ecopages-react-page']!();
			expect(testWindow.__ECO_REACT_HYDRATION_TEST__!.hydrateCalls[0]?.tree).toMatchObject({
				Component: initialPage,
			});
			expect(testWindow.__ECO_REACT_HYDRATION_TEST__!.renderCalls).toHaveLength(0);
			releaseUpdate();
			await update;
			expect(options.Page).not.toBe(initialPage);
			expect(testWindow.__ECO_REACT_HYDRATION_TEST__!.renderCalls).toEqual([
				{ Component: options.Page, props: { title: 'Hello React' } },
			]);
		} finally {
			releaseInitial();
			releaseUpdate();
			delete testGlobals.__ECO_TEST_PENDING_PRELOAD__;
		}
	});
});

describe('React Island Host lifecycle', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('hydrates in place, ignores repeated startup, and releases removed hosts', async () => {
		const host = document.createElement('eco-island');
		host.setAttribute('data-eco-island', '');
		host.setAttribute('data-eco-island-integration', 'react');
		host.setAttribute('data-eco-component-id', 'instance-1');
		host.setAttribute('data-eco-component-key', 'component-1');
		host.setAttribute('data-eco-props', btoa(JSON.stringify({ value: 'server' })));
		const child = document.createElement('input');
		child.value = 'typed before hydration';
		host.appendChild(child);
		document.body.appendChild(host);

		const calls = { hydrate: 0, render: 0, unmount: 0, recoverableErrors: 0 };
		const hydratedComponents: unknown[] = [];
		const runtime: IslandHydrationRuntime = { islandRoots: {}, islandComponents: {} };
		const reactRuntime = {
			hydrateRoot: (
				target: HTMLElement,
				tree: unknown,
				options?: { onRecoverableError?: (error: unknown) => void },
			) => {
				calls.hydrate += 1;
				if (options?.onRecoverableError) calls.recoverableErrors += 1;
				hydratedComponents.push((tree as { props: { Component: unknown } }).props.Component);
				const root = {
					render: (nextTree: unknown) => {
						calls.render += 1;
						hydratedComponents.push((nextTree as { props: { Component: unknown } }).props.Component);
					},
					unmount: () => {
						calls.unmount += 1;
					},
				};
				(tree as { type: (props: unknown) => unknown }).type((tree as { props: unknown }).props);
				void target;
				return root;
			},
			createElement: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
			useEffect: (effect: () => void) => queueMicrotask(effect),
		};
		const Component = () => null;
		const options = {
			targetSelector: '[data-eco-component-key="component-1"]',
			componentModule: { default: Component },
			scriptId: 'island-script',
			runtime: reactRuntime,
			runtimeState: runtime,
		};

		mountIslands(options);
		mountIslands(options);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(calls.hydrate).toBe(1);
		expect(host.firstElementChild).toBe(child);
		expect(host.getAttribute('data-eco-hydrated')).toBe('true');
		expect(calls.recoverableErrors).toBe(1);

		const NextComponent = () => null;
		updateIslands(options, { default: NextComponent });
		expect(calls.render).toBe(1);
		expect(hydratedComponents[hydratedComponents.length - 1]).toBe(NextComponent);

		const secondHost = host.cloneNode(false) as HTMLElement;
		document.body.appendChild(secondHost);
		mountIslands(options);
		expect(calls.hydrate).toBe(2);
		expect(hydratedComponents[hydratedComponents.length - 1]).toBe(NextComponent);

		host.remove();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(calls.unmount).toBe(1);
		runtime.observer?.disconnect();
	});

	it('preserves a focused uncontrolled input with the real React hydrator', async () => {
		const host = document.createElement('eco-island');
		host.setAttribute('data-eco-island', '');
		host.setAttribute('data-eco-component-id', 'real-instance');
		host.setAttribute('data-eco-component-key', 'real-component');
		host.setAttribute('data-eco-props', btoa(JSON.stringify({ value: 'server value' })));
		const input = document.createElement('input');
		input.defaultValue = 'server value';
		input.value = 'typed before hydration';
		host.appendChild(input);
		document.body.appendChild(host);
		input.focus();

		const Component = (props: Record<string, unknown>) =>
			createElement('input', { defaultValue: String(props.value ?? '') });
		const reactRuntime = {
			hydrateRoot: (
				target: HTMLElement,
				tree: unknown,
				options?: { onRecoverableError?: (error: unknown) => void },
			) => {
				const root = hydrateRoot(target, tree as ReactNode, options);
				return {
					render: (nextTree: unknown) => root.render(nextTree as ReactNode),
					unmount: () => root.unmount(),
				};
			},
			createElement: (type: unknown, props: Record<string, unknown>) => createElement(type as ElementType, props),
			useEffect: (effect: () => void) => {
				useEffect(effect);
			},
		};
		const runtime: IslandHydrationRuntime = { islandRoots: {}, islandComponents: {} };

		mountIslands({
			targetSelector: '[data-eco-component-key="real-component"]',
			componentModule: { default: Component },
			scriptId: 'real-island-script',
			runtime: reactRuntime,
			runtimeState: runtime,
		});
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(host.firstElementChild).toBe(input);
		expect(input.value).toBe('typed before hydration');
		expect(document.activeElement).toBe(input);
		expect(host.getAttribute('data-eco-hydrated')).toBe('true');
		runtime.observer?.disconnect();
	});

	it('resolves the component matching componentRef when a module exports multiple components from the same file', async () => {
		const host = document.createElement('eco-island');
		host.setAttribute('data-eco-island', '');
		host.setAttribute('data-eco-component-id', 'multi-instance');
		host.setAttribute('data-eco-component-key', 'multi-component');
		document.body.appendChild(host);

		const Helper = () => null;
		Helper.config = { identity: { id: 'Helper', file: '/app/Counter.tsx' } };

		const Target = () => null;
		Target.config = { identity: { id: 'Target', file: '/app/Counter.tsx' } };

		let hydratedComponent: unknown;
		const reactRuntime = {
			hydrateRoot: (_target: HTMLElement, tree: unknown) => {
				hydratedComponent = (tree as { props: { Component: unknown } }).props.Component;
				return { render: () => {}, unmount: () => {} };
			},
			createElement: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
			useEffect: () => {},
		};
		const runtime: IslandHydrationRuntime = { islandRoots: {}, islandComponents: {} };

		mountIslands({
			targetSelector: '[data-eco-component-key="multi-component"]',
			componentModule: { Helper, Target },
			componentRef: 'Target',
			componentFile: '/app/Counter.tsx',
			scriptId: 'multi-island-script',
			runtime: reactRuntime,
			runtimeState: runtime,
		});

		expect(hydratedComponent).toBe(Target);
		runtime.observer?.disconnect();
	});
});
