import { createElement, Suspense, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '@ecopages/core';
import { renderReactHtml, resolveReactRuntimeModules } from '../render/react-runtime.ts';
import { createLazyCollectionComponents } from './lazy-collection-components.ts';

function entry(text: string): EcoComponent<Record<string, unknown>> {
	return (() => createElement('p', null, text)) as unknown as EcoComponent<Record<string, unknown>>;
}

type Load = (slug: string) => Promise<EcoComponent<Record<string, unknown>>>;

let collectionCount = 0;

/** Gives every test its own collection, because lookups are shared per collection name. */
function uniqueCollection(): string {
	collectionCount += 1;
	return `posts-${collectionCount}`;
}

function loader(load: Load, collection = uniqueCollection()) {
	return Object.assign(load, { collection });
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
		const posts = createLazyCollectionComponents(loader(async () => entry('post')));

		expect(posts.get('first')).toBe(posts.get('first'));
		expect(posts.get('first')).not.toBe(posts.get('second'));
	});

	it('loads each slug once however many times it renders', async () => {
		const load = vi.fn(async (slug: string) => entry(slug));
		const posts = createLazyCollectionComponents(loader(load));
		const First = posts.get('first');

		const html = await render(
			createElement(Suspense, { fallback: null }, createElement(First), createElement(posts.get('first'))),
		);

		expect(html).toBe('<!--$--><p>first</p><p>first</p><!--/$-->');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('renders the entry, not the fallback, in the server HTML', async () => {
		const Content = createLazyCollectionComponents(
			loader(async (slug) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return entry(slug);
			}),
		).get('slow');

		const html = await render(
			createElement(Suspense, { fallback: createElement('i', null, 'loading') }, createElement(Content)),
		);

		expect(html).toContain('<p>slow</p>');
		expect(html).not.toContain('loading');
	});

	it('retries a failed load on the next lookup instead of replaying the rejection', async () => {
		const load = vi.fn<Load>().mockRejectedValueOnce(new Error('network')).mockResolvedValue(entry('recovered'));
		const posts = createLazyCollectionComponents(loader(load));
		const failed = posts.get('first');

		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(render(createElement(failed))).rejects.toThrow('network');

		const retried = posts.get('first');
		expect(retried).not.toBe(failed);
		expect(await render(createElement(retried))).toBe('<p>recovered</p>');
	});

	it('starts a new lookup on the server when the collection loader is a new function', async () => {
		const collection = uniqueCollection();
		const first = createLazyCollectionComponents(loader(async () => entry('old graph'), collection));
		await render(createElement(first.get('first')));

		const reloaded = createLazyCollectionComponents(loader(async () => entry('new graph'), collection));

		expect(reloaded.get('first')).not.toBe(first.get('first'));
		expect(await render(createElement(reloaded.get('first')))).toBe('<p>new graph</p>');
	});

	function withBrowserWindow(run: () => Promise<void>): Promise<void> {
		vi.stubGlobal('window', globalThis);
		return run().finally(() => vi.unstubAllGlobals());
	}

	it('keeps loaded entries in the browser when a re-evaluated Page passes a new loader for the collection', async () => {
		await withBrowserWindow(async () => {
			const collection = uniqueCollection();
			const firstLoad = vi.fn(async (slug: string) => entry(`first loader ${slug}`));
			const first = createLazyCollectionComponents(loader(firstLoad, collection));
			const loaded = first.get('first-post');
			await render(createElement(loaded));

			const nextLoad = vi.fn(async (slug: string) => entry(`next loader ${slug}`));
			const next = createLazyCollectionComponents(loader(nextLoad, collection));

			expect(next.get('first-post')).toBe(loaded);
			expect(await render(createElement(next.get('added-post')))).toBe('<p>next loader added-post</p>');
			expect(firstLoad).toHaveBeenCalledOnce();
		});
	});

	it('renders the edited entry under the same lazy type once the new loader returns a new module', async () => {
		await withBrowserWindow(async () => {
			const collection = uniqueCollection();
			const original = entry('original');
			const posts = createLazyCollectionComponents(loader(async () => original, collection));
			const loaded = posts.get('first-post');
			expect(await render(createElement(loaded))).toBe('<p>original</p>');

			const edited = createLazyCollectionComponents(loader(async () => entry('edited'), collection));
			await new Promise((resolve) => setTimeout(resolve));
			expect(edited.get('first-post')).toBe(loaded);
			expect(await render(createElement(edited.get('first-post')))).toBe('<p>edited</p>');
		});
	});
});
