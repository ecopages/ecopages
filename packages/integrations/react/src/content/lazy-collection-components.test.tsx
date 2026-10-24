import { createElement, Suspense, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcoComponent } from '@ecopages/core';
import { renderReactHtml, resolveReactRuntimeModules } from '../render/react-runtime.ts';
import { createLazyCollectionComponents } from './lazy-collection-components.ts';

function entry(text: string): EcoComponent<Record<string, unknown>> {
	return (() => createElement('p', null, text)) as unknown as EcoComponent<Record<string, unknown>>;
}

function render(node: ReactNode): Promise<string> {
	return renderReactHtml(resolveReactRuntimeModules(undefined), node);
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
});
