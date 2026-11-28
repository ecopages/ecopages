import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { userEvent } from 'vitest/browser';
import { clearNavigationHtmlCache, fetchNavigationPage, getCachedNavigationHtml } from '@ecopages/core/client';
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
let fetchSpy: MockInstance<typeof fetch>;

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
			startManager(`<a id="eager" href="${destination('eager')}" data-eco-prefetch="eager">Eager</a>`);
			await vi.waitFor(() => expect(getCachedNavigationHtml(destination('eager'))).toBe(HTML));

			await fetchNavigationPage(destination('eager'));

			expect(requestedTests()).toEqual(['eager']);
		});
	});

	describe('data saver', () => {
		function withConnection(connection: object): () => void {
			Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
			return () => {
				Reflect.deleteProperty(navigator, 'connection');
			};
		}

		it('makes no request for a direct prefetch while Save-Data is on', async () => {
			const restore = withConnection({ saveData: true });
			try {
				const prefetchManager = new PrefetchManager({ strategy: 'hover' });

				await prefetchManager.prefetch(new URL(destination('saver-direct'), window.location.href).href);
			} finally {
				restore();
			}

			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('makes no request for a direct prefetch on a 2g connection', async () => {
			const restore = withConnection({ effectiveType: '2g' });
			try {
				const prefetchManager = new PrefetchManager({ strategy: 'hover' });

				await prefetchManager.prefetch(new URL(destination('saver-2g'), window.location.href).href);
			} finally {
				restore();
			}

			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('makes no request for an eager link that appears after the manager started', () => {
			const prefetchManager = startManager('');
			const restore = withConnection({ saveData: true });
			try {
				const late = document.createElement('div');
				late.innerHTML = `<a href="${destination('saver-late')}" data-eco-prefetch="eager">Late</a>`;
				container.append(late);

				prefetchManager.observeLinks(late);
			} finally {
				restore();
			}

			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it('prefetches when respectDataSaver is off', async () => {
			const restore = withConnection({ saveData: true });
			try {
				const prefetchManager = new PrefetchManager({ strategy: 'hover', respectDataSaver: false });

				await prefetchManager.prefetch(new URL(destination('saver-off'), window.location.href).href);
			} finally {
				restore();
			}

			expect(requestedTests()).toEqual(['saver-off']);
		});
	});

	describe('Cache-Control', () => {
		const noStore = async () =>
			new Response(HTML, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });

		it('does not keep a prefetched page the server marks no-store', async () => {
			fetchSpy.mockImplementation(noStore);
			const prefetchManager = new PrefetchManager({ strategy: 'hover' });

			await prefetchManager.prefetch(new URL(destination('no-store'), window.location.href).href);

			expect(getCachedNavigationHtml(destination('no-store'))).toBeNull();
		});

		it('prefetches a no-store page once, so its extra request is not repeated on every hover', async () => {
			fetchSpy.mockImplementation(noStore);
			const prefetchManager = new PrefetchManager({ strategy: 'hover' });
			const href = new URL(destination('no-store-once'), window.location.href).href;

			await prefetchManager.prefetch(href);
			await prefetchManager.prefetch(href);

			expect(requestedTests()).toEqual(['no-store-once']);
		});
	});

	describe('one-use hold of a no-store page', () => {
		const noStore = async () =>
			new Response(HTML, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } });

		beforeEach(() => {
			fetchSpy.mockImplementation(noStore);
		});

		async function hover(id: string): Promise<void> {
			await userEvent.hover(link(id));
			await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		}

		it('answers the click that follows a hover from the prefetched copy', async () => {
			startManager(`<a id="cart" href="${destination('hold-click')}">Cart</a>`);
			await hover('cart');

			await fetchNavigationPage(destination('hold-click'));

			expect(requestedTests()).toEqual(['hold-click']);
		});
	});

	describe('priority images', () => {
		const IMAGE_FILE = '/packages/browser-router/test/fixtures/pixel.svg';

		/** An image that loads. The query tells the requests of one test apart; the file is the same. */
		const image = (name: string) => `${IMAGE_FILE}?name=${name}&run=${run}`;

		/** An image that fails to load, which a later prefetch may request again. */
		const missingImage = (name: string) => `/prefetch-images/missing.png?name=${name}&run=${run}`;

		const pages = new Map<string, string>();
		const heads = new Map<string, string>();

		function requestedImages(): string[] {
			return performance
				.getEntriesByType('resource')
				.map((entry) => new URL(entry.name))
				.filter((url) => url.searchParams.get('run') === String(run) && url.searchParams.has('name'))
				.map((url) => url.searchParams.get('name')!);
		}

		function prefetchPage(test: string, options: Partial<PrefetchOptions> = {}): Promise<void> {
			return new PrefetchManager({ strategy: 'hover', ...options }).prefetch(
				new URL(destination(test), window.location.href).href,
			);
		}

		/**
		 * Waits until the requests of an earlier prefetch have started and settled.
		 *
		 * @remarks
		 * A request that must not happen cannot be waited for. A page whose only image is the marker is
		 * prefetched after it, and once the marker shows up, every earlier request has started.
		 */
		async function afterWarming(): Promise<string[]> {
			pages.set('marker', `<img fetchpriority="high" src="${image('marker')}">`);
			await prefetchPage('marker');
			await vi.waitFor(() => expect(requestedImages()).toContain('marker'));
			return requestedImages().filter((name) => name !== 'marker');
		}

		beforeEach(() => {
			pages.clear();
			heads.clear();
			performance.clearResourceTimings();
			fetchSpy.mockImplementation(async (input) => {
				const test = new URL(String(input), window.location.href).searchParams.get('test') ?? '';
				return new Response(
					`<html><head>${heads.get(test) ?? ''}</head><body>${pages.get(test) ?? ''}</body></html>`,
					{
						headers: { 'Content-Type': 'text/html' },
					},
				);
			});
		});

		it('requests the high-priority image of a prefetched page and no other image', async () => {
			pages.set(
				'hero',
				`<img fetchpriority="high" src="${image('hero')}">
				<img loading="lazy" src="${image('lazy')}">
				<img fetchpriority="high" loading="lazy" src="${image('lazy-high')}">
				<img src="${image('plain')}">`,
			);

			await prefetchPage('hero');

			expect(await afterWarming()).toEqual(['hero']);
		});

		it('requests the image a page preloads in its head', async () => {
			heads.set('preloaded', `<link rel="preload" as="image" href="${image('preloaded')}">`);

			await prefetchPage('preloaded');

			expect(await afterWarming()).toEqual(['preloaded']);
		});

		it('requests the one candidate the browser picks from srcset and sizes, not the src', async () => {
			pages.set(
				'srcset',
				`<img fetchpriority="high" src="${image('fallback')}" srcset="${image('small')} 100w, ${image('huge')} 1000000w" sizes="100px">`,
			);

			await prefetchPage('srcset');

			expect(await afterWarming()).toEqual(['small']);
		});

		it('requests the source of a picture the browser picks, not its fallback', async () => {
			pages.set(
				'picture',
				`<picture>
					<source type="image/avif-not-supported" srcset="${image('unsupported')}">
					<source type="image/svg+xml" srcset="${image('source')}">
					<img fetchpriority="high" src="${image('fallback')}">
				</picture>`,
			);

			await prefetchPage('picture');

			expect(await afterWarming()).toEqual(['source']);
		});

		it('requests at most two images for one page', async () => {
			pages.set(
				'budget',
				['first', 'second', 'third'].map((name) => `<img fetchpriority="high" src="${image(name)}">`).join(''),
			);

			await prefetchPage('budget');

			expect((await afterWarming()).sort()).toEqual(['first', 'second']);
		});

		it('requests an image again on a later prefetch when its load failed', async () => {
			pages.set('failed-a', `<img fetchpriority="high" src="${missingImage('failed')}">`);
			pages.set('failed-b', `<img fetchpriority="high" src="${missingImage('failed')}">`);
			const prefetchManager = new PrefetchManager({ strategy: 'hover' });

			await prefetchManager.prefetch(new URL(destination('failed-a'), window.location.href).href);
			await vi.waitFor(() => expect(requestedImages()).toEqual(['failed']));
			await prefetchManager.prefetch(new URL(destination('failed-b'), window.location.href).href);

			await vi.waitFor(() => expect(requestedImages()).toEqual(['failed', 'failed']));
		});

		it('requests no image when images are turned off', async () => {
			pages.set('off', `<img fetchpriority="high" src="${image('off')}">`);

			await prefetchPage('off', { images: false });

			expect(await afterWarming()).toEqual([]);
		});

		it('requests no image while data saver is on', async () => {
			pages.set('saver', `<img fetchpriority="high" src="${image('saver')}">`);
			Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });

			try {
				await prefetchPage('saver');
			} finally {
				Reflect.deleteProperty(navigator, 'connection');
			}

			expect(await afterWarming()).toEqual([]);
		});
	});

	describe('visited pages', () => {
		beforeEach(() => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		});

		it('does not prefetch a link to a page the router already navigated to', async () => {
			const visited = new PrefetchManager({ strategy: 'hover' });
			const href = new URL(destination('visited'), window.location.href).href;

			visited.markVisited(href);
			await visited.prefetch(href);

			expect(fetchSpy).not.toHaveBeenCalled();
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
