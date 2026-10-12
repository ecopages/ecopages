import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { clearNavigationHtmlCache, fetchNavigationPage } from '@ecopages/core/router/navigation-pipeline';
import { PrefetchManager, type PrefetchOptions } from '../src/client/services/prefetch-manager.ts';

const HTML = '<html><head></head><body></body></html>';

let run = 0;

/**
 * A destination URL unique to the current test.
 *
 * @remarks
 * A prefetch that is still in flight when a test ends lands in the shared navigation cache after
 * `clearNavigationHtmlCache()`. The `run` parameter keeps such a late entry from answering a later
 * test's request from the cache.
 */
const destination = (test: string) => `/prefetch/destination?test=${test}&run=${run}`;

let container: HTMLDivElement;
let manager: PrefetchManager | undefined;
let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;

/**
 * Starts a manager over the given markup with the request tracker already attached.
 *
 * @remarks
 * The tracker is the `fetch` spy installed in `beforeEach`, so every request the manager makes from
 * `start()` onward is recorded. A negative assertion therefore holds for the whole page lifetime,
 * not only after load.
 */
function startManager(markup: string, options: Partial<PrefetchOptions> = {}): PrefetchManager {
	container.innerHTML = markup;
	manager = new PrefetchManager(options);
	manager.start();
	return manager;
}

function link(id: string): HTMLAnchorElement {
	return container.querySelector<HTMLAnchorElement>(`#${id}`)!;
}

function requestedTests(): string[] {
	return fetchSpy.mock.calls.map(
		([url]) => new URL(String(url), window.location.href).searchParams.get('test') ?? '',
	);
}

beforeEach(() => {
	run += 1;
	fetchSpy = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async () => new Response(HTML, { headers: { 'Content-Type': 'text/html' } }));
	container = document.createElement('div');
	document.body.append(container);
});

afterEach(async () => {
	manager?.stop();
	manager = undefined;
	container.remove();
	clearNavigationHtmlCache();
	vi.useRealTimers();
	vi.restoreAllMocks();
	await userEvent.unhover(document.body);
});

describe('PrefetchManager', () => {
	it('requests prefetched HTML with low network priority', async () => {
		const prefetchManager = new PrefetchManager({ strategy: 'hover' });

		await prefetchManager.prefetch(new URL('/prefetch-priority', window.location.href).href);

		expect(fetchSpy).toHaveBeenCalledWith(
			new URL('/prefetch-priority', window.location.href).href,
			expect.objectContaining({ priority: 'low' }),
		);
	});

	describe('eager', () => {
		it('prefetches an eager link as soon as the manager starts', () => {
			startManager(`<a id="eager" href="${destination('eager')}" data-eco-prefetch="eager">Eager</a>`);

			expect(requestedTests()).toEqual(['eager']);
		});

		it('keeps the prefetched page for the navigation that follows', async () => {
			const prefetchManager = startManager(
				`<a id="eager" href="${destination('eager')}" data-eco-prefetch="eager">Eager</a>`,
			);
			await vi.waitFor(() => expect(prefetchManager.getCachedHtml(destination('eager'))).toBe(HTML));

			await fetchNavigationPage(destination('eager'));

			expect(requestedTests()).toEqual(['eager']);
			expect(prefetchManager.isPrefetched(destination('eager'))).toBe(true);
		});
	});

	describe('hover', () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		});

		it('prefetches a hover link only once it is hovered', async () => {
			startManager(`<a id="hover" href="${destination('hover')}" data-eco-prefetch="hover">Hover</a>`);
			vi.advanceTimersByTime(5_000);
			expect(requestedTests()).toEqual([]);

			await userEvent.hover(link('hover'));
			vi.advanceTimersByTime(64);
			expect(requestedTests()).toEqual([]);
			vi.advanceTimersByTime(1);

			expect(requestedTests()).toEqual(['hover']);
		});

		it('waits for the delay set on the link before prefetching', async () => {
			startManager(
				`<a id="slow" href="${destination('delay')}" data-eco-prefetch="hover" data-eco-prefetch-delay="500">Slow</a>`,
			);

			await userEvent.hover(link('slow'));
			vi.advanceTimersByTime(499);
			expect(requestedTests()).toEqual([]);
			vi.advanceTimersByTime(1);

			expect(requestedTests()).toEqual(['delay']);
		});

		it('uses the delay of the manager when the link sets none', async () => {
			startManager(`<a id="hover" href="${destination('hover')}" data-eco-prefetch="hover">Hover</a>`, {
				delay: 200,
			});

			await userEvent.hover(link('hover'));
			vi.advanceTimersByTime(199);
			expect(requestedTests()).toEqual([]);
			vi.advanceTimersByTime(1);

			expect(requestedTests()).toEqual(['hover']);
		});

		it('cancels the prefetch when the pointer leaves before the delay', async () => {
			startManager(`<a id="hover" href="${destination('hover')}" data-eco-prefetch="hover">Hover</a>`);

			await userEvent.hover(link('hover'));
			vi.advanceTimersByTime(30);
			await userEvent.unhover(link('hover'));
			vi.advanceTimersByTime(5_000);

			expect(requestedTests()).toEqual([]);
		});

		it('prefetches an intent link when it is hovered', async () => {
			startManager(`<a id="intent" href="${destination('intent')}" data-eco-prefetch="intent">Intent</a>`);

			await userEvent.hover(link('intent'));
			vi.advanceTimersByTime(65);

			expect(requestedTests()).toEqual(['intent']);
		});

		it('prefetches a link that follows the strategy of the manager when it is hovered', async () => {
			startManager(`<a id="plain" href="${destination('plain')}">Plain</a>`, { strategy: 'intent' });

			await userEvent.hover(link('plain'));
			vi.advanceTimersByTime(65);

			expect(requestedTests()).toEqual(['plain']);
		});
	});

	describe('opt-outs', () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		});

		it('never prefetches a link marked data-eco-no-prefetch', async () => {
			startManager(`<a id="none" href="${destination('none')}" data-eco-no-prefetch>None</a>
				<a id="hover" href="${destination('hover')}" data-eco-prefetch="hover">Hover</a>`);

			await userEvent.hover(link('none'));
			vi.advanceTimersByTime(5_000);
			expect(requestedTests()).toEqual([]);

			await userEvent.hover(link('hover'));
			vi.advanceTimersByTime(65);
			expect(requestedTests()).toEqual(['hover']);
		});

		it('never prefetches a link marked for a full reload', async () => {
			startManager(`<a id="reload" href="${destination('reload')}" data-eco-reload data-eco-prefetch="hover">Reload</a>
				<a id="hover" href="${destination('hover')}" data-eco-prefetch="hover">Hover</a>`);

			await userEvent.hover(link('reload'));
			vi.advanceTimersByTime(5_000);
			expect(requestedTests()).toEqual([]);

			await userEvent.hover(link('hover'));
			vi.advanceTimersByTime(65);
			expect(requestedTests()).toEqual(['hover']);
		});

		it('never prefetches the current page', async () => {
			const here = `${window.location.pathname}${window.location.search}`;
			startManager(`<a id="self" href="${here}" data-eco-prefetch="hover">Self</a>
				<a id="hover" href="${destination('hover')}" data-eco-prefetch="hover">Hover</a>`);

			await userEvent.hover(link('self'));
			vi.advanceTimersByTime(5_000);
			expect(requestedTests()).toEqual([]);

			await userEvent.hover(link('hover'));
			vi.advanceTimersByTime(65);
			expect(requestedTests()).toEqual(['hover']);
		});
	});

	describe('viewport', () => {
		const spacer = '<div style="height: 4000px"></div>';

		it('prefetches a viewport link only once it scrolls into view', async () => {
			startManager(`<a id="above" href="${destination('above')}" data-eco-prefetch="viewport">Above</a>
				${spacer}
				<a id="below" href="${destination('below')}" data-eco-prefetch="viewport">Below</a>`);

			await vi.waitFor(() => expect(requestedTests()).toEqual(['above']));

			link('below').scrollIntoView();

			await vi.waitFor(() => expect(requestedTests()).toEqual(['above', 'below']));
		});

		it('skips static asset and download links that scroll into view', async () => {
			startManager(`${spacer}
				<a id="asset" href="/files/report.pdf" data-eco-prefetch="viewport">Asset</a>
				<a id="download" href="${destination('download')}" data-eco-prefetch="viewport" download>Download</a>
				<a id="below" href="${destination('below')}" data-eco-prefetch="viewport">Below</a>`);

			link('asset').scrollIntoView();

			await vi.waitFor(() => expect(requestedTests()).toEqual(['below']));
		});
	});
});
