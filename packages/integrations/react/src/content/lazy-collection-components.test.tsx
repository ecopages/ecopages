import { createElement, Suspense, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '@ecopages/core';
import { renderReactHtml, resolveReactRuntimeModules } from '../render/react-runtime.ts';
import { createLazyCollectionComponents } from './lazy-collection-components.ts';

function entry(text: string): EcoComponent<Record<string, unknown>> {
	return (() => createElement('p', null, text)) as unknown as EcoComponent<Record<string, unknown>>;
}

function render(node: ReactNode): Promise<string> {
	return renderReactHtml(resolveReactRuntimeModules(undefined), node, {
		timeoutMs: 1_000,
		label: 'collection entry',
	});
}

describe('createLazyCollectionComponents', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns the same component for a slug and a different one per slug', () => {
		const posts = createLazyCollectionComponents(async () => entry('post'));

		expect(posts.get('first')).toBe(posts.get('first'));
		expect(posts.get('first')).not.toBe(posts.get('second'));
	});

	it('loads each slug once however many times it renders', async () => {
		const load = vi.fn(async (slug: string) => entry(slug));
		const posts = createLazyCollectionComponents(load);
		const First = posts.get('first');

		const html = await render(
			createElement(Suspense, { fallback: null }, createElement(First), createElement(posts.get('first'))),
		);

		expect(html).toBe('<!--$--><p>first</p><p>first</p><!--/$-->');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('renders the entry, not the fallback, in the server HTML', async () => {
		const Content = createLazyCollectionComponents(async (slug) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return entry(slug);
		}).get('slow');

		const html = await render(
			createElement(Suspense, { fallback: createElement('i', null, 'loading') }, createElement(Content)),
		);

		expect(html).toContain('<p>slow</p>');
		expect(html).not.toContain('loading');
	});

	it('retries a failed load on the next lookup instead of replaying the rejection', async () => {
		const load = vi
			.fn<(slug: string) => Promise<EcoComponent<Record<string, unknown>>>>()
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValue(entry('recovered'));
		const posts = createLazyCollectionComponents(load);
		const failed = posts.get('first');

		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(render(createElement(failed))).rejects.toThrow('network');

		const retried = posts.get('first');
		expect(retried).not.toBe(failed);
		expect(await render(createElement(retried))).toBe('<p>recovered</p>');
	});

	it('returns the same lazy type when the Page module calls the helper again with the same loader', () => {
		const load = async () => entry('post');
		const first = createLazyCollectionComponents(load);
		const again = createLazyCollectionComponents(load);

		expect(again.get('first')).toBe(first.get('first'));
	});

	type HmrWindow = typeof globalThis & {
		__ECO_PAGES__?: { hmrHandlers?: Record<string, (url: string) => Promise<void>> };
	};

	async function withHmrWindow<T>(run: (hmrWindow: HmrWindow) => Promise<T>): Promise<T> {
		vi.stubGlobal('window', globalThis);
		const hmrWindow = globalThis as HmrWindow;
		const previousPages = hmrWindow.__ECO_PAGES__;
		try {
			return await run(hmrWindow);
		} finally {
			if (previousPages === undefined) delete hmrWindow.__ECO_PAGES__;
			else hmrWindow.__ECO_PAGES__ = previousPages;
			vi.unstubAllGlobals();
		}
	}

	function identifiedEntry(id: string, file: string): EcoComponent<Record<string, unknown>> {
		const loaded = entry('post');
		loaded.config = { identity: { id, file, integration: 'react' } };
		return loaded;
	}

	it('drops a slug when that entry source module hot-updates', async () => {
		await withHmrWindow(async (hmrWindow) => {
			const importPath = '/assets/__eco_dev__/content/posts/first-post.js';
			const previousHandler = vi.fn(async () => {});
			hmrWindow.__ECO_PAGES__ = { hmrHandlers: { [importPath]: previousHandler } };
			const posts = createLazyCollectionComponents(async () =>
				identifiedEntry('first-post', '/app/src/content/posts/first-post.mdx'),
			);
			const first = posts.get('first-post');
			await render(createElement(first));

			const handler = hmrWindow.__ECO_PAGES__?.hmrHandlers?.[importPath];
			expect(handler).toBeTypeOf('function');
			await handler?.(`${importPath}?t=1`);
			expect(previousHandler).toHaveBeenCalledOnce();

			expect(posts.get('first-post')).not.toBe(first);
			await render(createElement(posts.get('first-post')));
			expect(hmrWindow.__ECO_PAGES__?.hmrHandlers?.[importPath]).toBe(handler);
		});
	});

	it('registers an HMR handler when the entry had none', async () => {
		await withHmrWindow(async (hmrWindow) => {
			const importPath = '/assets/__eco_dev__/content/posts/second-post.js';
			hmrWindow.__ECO_PAGES__ = { hmrHandlers: {} };
			const posts = createLazyCollectionComponents(async () =>
				identifiedEntry('second-post', '/app/src/content/posts/second-post.mdx'),
			);
			const first = posts.get('second-post');
			await render(createElement(first));

			const handler = hmrWindow.__ECO_PAGES__?.hmrHandlers?.[importPath];
			expect(handler).toBeTypeOf('function');
			await expect(handler?.(`${importPath}?t=1`)).rejects.toThrow();
			expect(posts.get('second-post')).not.toBe(first);
		});
	});
});
