import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { createElement, useEffect, useState, type FC, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

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

import { EcoRouter, PageContent, clearLayoutCache } from '../src/router.ts';

type NestedLayoutComponent = FC<{ children?: ReactNode }> & {
	config?: { __eco?: { id: string; file: string; integration: string } };
};

type StatefulLayoutTestHandle = {
	mountCount: number;
};

function createStatefulEcoLayout(
	testId: string,
	eco: { id: string; file: string },
): NestedLayoutComponent & { testState: StatefulLayoutTestHandle } {
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

	Layout.displayName = testId;
	Layout.config = { __eco: { ...eco, integration: 'react' } };
	const StatefulLayout = Layout as NestedLayoutComponent & { testState: StatefulLayoutTestHandle };
	StatefulLayout.testState = testState;
	return StatefulLayout;
}

function createNestedEcoLayout(testId: string, eco: { id: string; file: string }): NestedLayoutComponent {
	const Layout = ({ children }: { children?: ReactNode }) =>
		createElement('div', { 'data-testid': testId }, testId, children);

	Layout.displayName = testId;
	Layout.config = { __eco: { ...eco, integration: 'react' } };
	return Layout;
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
	const user = userEvent.setup();

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

	it('preserves shared outer layout state across [A,B] and [A,C] SPA navigation', async () => {
		const sharedEco = { id: 'app-shell', file: '/app/layouts/app-shell.tsx' };
		const shellDocsImport = createStatefulEcoLayout('shared-shell', sharedEco);
		const shellSettingsImport = createStatefulEcoLayout('shared-shell', sharedEco);
		const docsInner = createNestedEcoLayout('docs-inner', {
			id: 'docs-inner',
			file: '/app/layouts/docs-inner.tsx',
		});
		const settingsInner = createNestedEcoLayout('settings-inner', {
			id: 'settings-inner',
			file: '/app/layouts/settings-inner.tsx',
		});

		const DocsPage = createNestedLayoutPageWithLink('DocsPage', [shellDocsImport, docsInner], {
			href: '/settings',
			testId: 'go-settings',
		});
		const SettingsPage = createNestedLayoutPage('SettingsPage', [shellSettingsImport, settingsInner]);

		clearLayoutCache();
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
				options: { persistLayouts: true, viewTransitions: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 100));
		const shell = container.querySelector('[data-testid="shared-shell"]') as HTMLDivElement;
		expect(shell).not.toBeNull();
		expect(container.querySelector('[data-testid="docs-inner"]')).not.toBeNull();
		expect(shellDocsImport.testState.mountCount).toBe(1);

		fireEvent.click(shell);
		expect(shell.getAttribute('data-tick')).toBe('1');

		await user.click(container.querySelector('[data-testid="go-settings"]') as HTMLAnchorElement);

		await vi.waitFor(() => {
			expect(loadPageModuleFromDocumentMock).toHaveBeenCalled();
			expect(container.querySelector('[data-testid="settings-inner"]')).not.toBeNull();
		});

		expect(shellDocsImport.testState.mountCount).toBe(1);
		expect(container.querySelector('[data-testid="shared-shell"]')?.getAttribute('data-tick')).toBe('1');
		expect(container.querySelector('[data-testid="docs-inner"]')).toBeNull();
		expect(container.querySelector('[data-testid="SettingsPage-page"]')).not.toBeNull();
	});
});
