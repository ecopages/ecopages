import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createElement, type ComponentType, type FC, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const loadPageModuleFromDocumentMock = vi.fn();

vi.mock('../src/navigation.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/navigation.ts')>();
	return {
		...actual,
		loadPageModuleFromDocument: (...args: Parameters<typeof actual.loadPageModuleFromDocument>) =>
			loadPageModuleFromDocumentMock(...args),
	};
});

import { EcoRouter, PageContent } from '../src/router.ts';
import { htmlPageResponse, useRouterTestEnvironment } from './react-router.harness.ts';

const DYNAMIC_STYLES_ID = 'eco-vt-dynamic-styles';
const ROOT_STYLES_ID = 'eco-vt-root-styles';

function createPage(name: string, body: ReactNode): FC {
	const Page: FC = () => createElement('div', { 'data-testid': `${name}-page` }, body);
	Page.displayName = name;
	return Page;
}

function namedTitle(name: string, attributes: Record<string, string> = {}): ReactNode {
	return createElement('h1', { 'data-view-transition': name, ...attributes }, name);
}

function viewTransitionNames(): string[] {
	return Array.from(document.querySelectorAll('[data-view-transition]')).map(
		(element) => getComputedStyle(element).viewTransitionName,
	);
}

describe('react-router view transitions', () => {
	const ctx = useRouterTestEnvironment();

	function mount(initial: FC, options: { viewTransitions: boolean }): void {
		ctx.root = createRoot(ctx.container);
		ctx.root.render(
			createElement(EcoRouter, {
				page: initial as ComponentType<unknown>,
				pageProps: {},
				options: { ...options, persistLayouts: false },
				// oxlint-disable-next-line no-children-prop
				children: createElement(PageContent),
			}),
		);
	}

	function routeTo(target: FC, path: string): void {
		loadPageModuleFromDocumentMock.mockImplementation(async (doc: Document, finalPath: string) => ({
			Component: target,
			props: {},
			doc,
			finalPath: path,
			moduleUrl: `virtual:${finalPath}`,
		}));
	}

	beforeEach(() => {
		loadPageModuleFromDocumentMock.mockReset();
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			htmlPageResponse('<html><head></head><body></body></html>'),
		);
	});

	afterEach(() => {
		document.getElementById(ROOT_STYLES_ID)?.remove();
		document.getElementById(DYNAMIC_STYLES_ID)?.remove();
	});

	it('names every data-view-transition element on first render and opts the document out of the root group', async () => {
		mount(createPage('index', namedTitle('page-title')), { viewTransitions: true });

		await expect.element(page.getByRole('heading', { name: 'page-title' })).toBeVisible();

		expect(viewTransitionNames()).toEqual(['page-title']);
		const rootStyles = document.getElementById(ROOT_STYLES_ID);
		expect(rootStyles?.hasAttribute('data-eco-persist')).toBe(true);
		expect(rootStyles?.textContent).toContain('view-transition-name: none');
		expect(rootStyles?.textContent).not.toContain('!important');
		expect(getComputedStyle(document.documentElement).viewTransitionName).toBe('none');
	});

	it('gives elements without an animate attribute morph styles and leaves fade elements alone', async () => {
		mount(
			createPage(
				'index',
				createElement(
					'div',
					null,
					namedTitle('morphs'),
					namedTitle('fades', { 'data-view-transition-animate': 'fade' }),
				),
			),
			{ viewTransitions: true },
		);

		await expect.element(page.getByRole('heading', { name: 'morphs' })).toBeVisible();

		const css = document.getElementById(DYNAMIC_STYLES_ID)?.textContent ?? '';
		expect(css).toContain('view-transition-old(morphs)');
		expect(css).not.toContain('view-transition-old(fades)');
	});

	it('runs the swap inside startViewTransition and names the incoming page elements', async () => {
		const namesWhenSwapped: string[][] = [];
		const startTransition = document.startViewTransition.bind(document);
		const startViewTransition = vi.spyOn(document, 'startViewTransition').mockImplementation((update) => {
			const transition = startTransition(update);
			void transition.updateCallbackDone.then(() => namesWhenSwapped.push(viewTransitionNames()));
			return transition;
		});
		const index = createPage(
			'index',
			createElement('div', null, namedTitle('page-title'), createElement('a', { href: '/post' }, 'to post')),
		);
		routeTo(createPage('post', namedTitle('post-title')), '/post');
		mount(index, { viewTransitions: true });
		await expect.element(page.getByRole('link', { name: 'to post' })).toBeVisible();

		await userEvent.click(page.getByRole('link', { name: 'to post' }));

		await expect.element(page.getByRole('heading', { name: 'post-title' })).toBeVisible();
		expect(startViewTransition).toHaveBeenCalledTimes(1);
		await expect.poll(() => namesWhenSwapped).toEqual([['post-title']]);
	});

	it('skips view transitions and root styles when they are disabled', async () => {
		const startViewTransition = vi.spyOn(document, 'startViewTransition');
		const index = createPage(
			'index',
			createElement('div', null, namedTitle('page-title'), createElement('a', { href: '/post' }, 'to post')),
		);
		routeTo(createPage('post', namedTitle('post-title')), '/post');
		mount(index, { viewTransitions: false });
		await expect.element(page.getByRole('link', { name: 'to post' })).toBeVisible();

		await userEvent.click(page.getByRole('link', { name: 'to post' }));

		await expect.element(page.getByRole('heading', { name: 'post-title' })).toBeVisible();
		expect(startViewTransition).not.toHaveBeenCalled();
		expect(document.getElementById(ROOT_STYLES_ID)).toBeNull();
	});
});
