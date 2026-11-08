import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createElement, useEffect, useState, type FC, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';

const loadPageModuleFromDocumentMock = vi.fn();

function htmlPageResponse(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

vi.mock('../src/navigation.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/navigation.ts')>();
	return {
		...actual,
		loadPageModuleFromDocument: (...args: Parameters<typeof actual.loadPageModuleFromDocument>) =>
			loadPageModuleFromDocumentMock(...args),
	};
});

import { EcoRouter, PageContent } from '../src/router.ts';
import { waitForRouterOwner } from './react-router.harness.ts';

type NestedLayoutComponent = FC<{ children?: ReactNode }>;

type StatefulLayoutTestHandle = {
	mountCount: number;
};

/** A plain layout function, as a layout module exports it: no component identity. */
function createStatefulLayout(testId: string): NestedLayoutComponent & { testState: StatefulLayoutTestHandle } {
	const testState: StatefulLayoutTestHandle = { mountCount: 0 };
	const Layout = ({ children }: { children?: ReactNode }) => {
		const [tick, setTick] = useState(0);
		useEffect(() => {
			testState.mountCount += 1;
			return () => {
				testState.mountCount -= 1;
			};
		}, []);

		return createElement(
			'div',
			{
				'data-testid': testId,
				'data-tick': String(tick),
				onClick: () => setTick((value) => value + 1),
			},
			`tick:${tick}`,
			children,
		);
	};

	return Object.assign(Layout, { testState });
}

function createNestedLayout(testId: string): NestedLayoutComponent {
	return ({ children }: { children?: ReactNode }) =>
		createElement('div', { 'data-testid': testId }, testId, children);
}

function createNestedLayoutPageWithLink(
	name: string,
	layouts: NestedLayoutComponent[],
	link: { href: string; testId: string },
) {
	const Page = () =>
		createElement(
			'div',
			null,
			createElement(
				'a',
				{
					href: link.href,
					'data-testid': link.testId,
					onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
				},
				'navigate',
			),
			createElement('div', { 'data-testid': `${name}-page` }, name),
		);
	(Page as FC & { config?: { layouts: NestedLayoutComponent[] }; displayName?: string }).displayName = name;
	(Page as FC & { config?: { layouts: NestedLayoutComponent[] } }).config = { layouts };
	return Page as FC & { config?: { layouts: NestedLayoutComponent[] } };
}

function createNestedLayoutPage(name: string, layouts: NestedLayoutComponent[]) {
	const Page = () => createElement('div', { 'data-testid': `${name}-page` }, name);
	(Page as FC & { config?: { layouts: NestedLayoutComponent[] }; displayName?: string }).displayName = name;
	(Page as FC & { config?: { layouts: NestedLayoutComponent[] } }).config = { layouts };
	return Page as FC & { config?: { layouts: NestedLayoutComponent[] } };
}

describe('nested layout persistence', () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		loadPageModuleFromDocumentMock.mockReset();
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		vi.restoreAllMocks();
	});

	async function navigateFromDocsToSettings(persistLayouts: boolean) {
		const shell = createStatefulLayout('shared-shell');
		const DocsPage = createNestedLayoutPageWithLink('DocsPage', [shell, createNestedLayout('docs-inner')], {
			href: '/settings',
			testId: 'go-settings',
		});
		const SettingsPage = createNestedLayoutPage('SettingsPage', [shell, createNestedLayout('settings-inner')]);

		vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlPageResponse('<html><head></head><body></body></html>'));
		loadPageModuleFromDocumentMock.mockResolvedValue({
			Component: SettingsPage,
			props: {},
			doc: document,
			finalPath: '/settings',
			moduleUrl: 'virtual:settings-page',
		});

		root = createRoot(container);
		root.render(
			createElement(EcoRouter, {
				page: DocsPage,
				pageProps: {},
				options: { persistLayouts, viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await expect.element(page.getByTestId('docs-inner')).toBeInTheDocument();
		await waitForRouterOwner();
		const shellElement = container.querySelector('[data-testid="shared-shell"]') as HTMLDivElement;
		expect(shell.testState.mountCount).toBe(1);

		await userEvent.click(shellElement, { position: { x: 2, y: 2 } });
		expect(shellElement.getAttribute('data-tick')).toBe('1');

		await userEvent.click(container.querySelector('[data-testid="go-settings"]') as HTMLAnchorElement);

		await vi.waitFor(() => {
			expect(loadPageModuleFromDocumentMock).toHaveBeenCalled();
			expect(container.querySelector('[data-testid="settings-inner"]')).not.toBeNull();
		});

		expect(container.querySelector('[data-testid="docs-inner"]')).toBeNull();
		expect(container.querySelector('[data-testid="SettingsPage-page"]')).not.toBeNull();
		return { shell, tick: container.querySelector('[data-testid="shared-shell"]')?.getAttribute('data-tick') };
	}

	it('keeps a shared plain outer layout mounted across [A,B] and [A,C] SPA navigation', async () => {
		const { shell, tick } = await navigateFromDocsToSettings(true);

		expect(shell.testState.mountCount).toBe(1);
		expect(tick).toBe('1');
	});

	it('remounts the shared outer layout when persistLayouts is off', async () => {
		const { shell, tick } = await navigateFromDocsToSettings(false);

		expect(shell.testState.mountCount).toBe(1);
		expect(tick).toBe('0');
	});
});
