import { afterEach, describe, expect, it, vi } from 'vitest';
import { handlePageHmr } from './page-hydration-hmr.ts';
import type { PageHydrationOptions } from './page-hydration.ts';

type TestGlobal = {
	window?: unknown;
	__ecoTestLayouts?: unknown[];
};

const testGlobal = globalThis as unknown as TestGlobal;
let moduleVersion = 0;

/** A plain layout function, with no component identity. */
const SharedLayout = () => null;

/** Each update imports a new module URL, as a cache-busted HMR update does. */
function pageModuleUrl(): string {
	moduleVersion += 1;
	return `data:text/javascript,${encodeURIComponent(
		`export default Object.assign(() => null, { config: { layouts: globalThis.__ecoTestLayouts } }); // ${moduleVersion}`,
	)}`;
}

async function applyUpdate(nextLayouts: unknown[]) {
	const reloadCurrentPage = vi.fn();
	testGlobal.window = {
		__ECO_PAGES__: {
			navigation: { getOwnerState: () => ({ owner: 'react-router' }), reloadCurrentPage },
			react: { mountGeneration: 0 },
		},
	};
	testGlobal.__ecoTestLayouts = nextLayouts;
	const currentPage = Object.assign(() => null, { config: { layouts: [SharedLayout] } });
	const options = {
		Page: currentPage,
		hasRouter: true,
		isMdx: false,
		hmr: {
			importPath: '/page.js',
			getLayouts: (Page: { config?: { layouts?: unknown[] } }) => Page.config?.layouts ?? [],
		},
	} as unknown as PageHydrationOptions;

	await handlePageHmr(options, pageModuleUrl(), 0, vi.fn(), vi.fn(), vi.fn());
	return reloadCurrentPage;
}

describe('handlePageHmr with the router', () => {
	afterEach(() => {
		delete testGlobal.window;
		delete testGlobal.__ecoTestLayouts;
	});

	it('keeps the navigation cache when the updated page passes the same plain layout function', async () => {
		const reloadCurrentPage = await applyUpdate([SharedLayout]);

		expect(reloadCurrentPage).toHaveBeenCalledWith(expect.objectContaining({ clearCache: false }));
	});

	it('clears the navigation cache when the updated page passes another layout function', async () => {
		const reloadCurrentPage = await applyUpdate([() => null]);

		expect(reloadCurrentPage).toHaveBeenCalledWith(expect.objectContaining({ clearCache: true }));
	});
});

describe('handlePageHmr without the router', () => {
	const fetchedDocument = { marker: 'fetched' };

	afterEach(() => {
		delete testGlobal.window;
		vi.unstubAllGlobals();
	});

	async function applyDirectUpdate(response: { ok: boolean; status: number }) {
		const render = vi.fn();
		const runtime = {
			react: { mountGeneration: 0, pageRoot: { render } },
			page: undefined as { document?: unknown } | undefined,
		};
		testGlobal.window = { __ECO_PAGES__: runtime, location: { href: 'http://localhost/page', pathname: '/page' } };
		const fetchMock = vi.fn(async () => ({ ...response, text: async () => '<html></html>' }));
		vi.stubGlobal('fetch', fetchMock);
		vi.stubGlobal(
			'DOMParser',
			class {
				parseFromString = () => fetchedDocument;
			},
		);
		const documentSeenByRender: unknown[] = [];
		render.mockImplementation(() => documentSeenByRender.push(runtime.page?.document));
		const options = {
			Page: () => null,
			hasRouter: false,
			isMdx: false,
			hmr: { importPath: '/page.js' },
			createTree: () => 'tree',
		} as unknown as PageHydrationOptions;
		const setPageState = vi.fn(() => {
			runtime.page = {};
		});

		await handlePageHmr(
			options,
			pageModuleUrl(),
			0,
			vi.fn(() => ({ props: {} })),
			setPageState,
			vi.fn(() => ({})),
		);
		return { render, fetchMock, documentSeenByRender };
	}

	it('publishes the fetched document as the server HTML source before it renders the new tree', async () => {
		const { render, fetchMock, documentSeenByRender } = await applyDirectUpdate({ ok: true, status: 200 });

		expect(fetchMock).toHaveBeenCalledWith('http://localhost/page', expect.anything());
		expect(render).toHaveBeenCalledTimes(1);
		expect(documentSeenByRender).toEqual([fetchedDocument]);
	});

	it('drops an update that a newer one overtook while it fetched', async () => {
		const render = vi.fn();
		testGlobal.window = {
			__ECO_PAGES__: { react: { mountGeneration: 0, pageRoot: { render } } },
			location: { href: 'http://localhost/page', pathname: '/page' },
		};
		const releases: Array<() => void> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise((resolve) => {
						releases.push(() => resolve({ ok: true, status: 200, text: async () => '' }));
					}),
			),
		);
		vi.stubGlobal(
			'DOMParser',
			class {
				parseFromString = () => ({});
			},
		);
		const options = {
			Page: () => null,
			hasRouter: false,
			isMdx: false,
			hmr: { importPath: '/page.js' },
			createTree: (page: { tag?: string }) => page.tag,
		} as unknown as PageHydrationOptions;
		const update = (tag: string) =>
			handlePageHmr(
				options,
				`data:text/javascript,${encodeURIComponent(`export default Object.assign(() => null, { tag: '${tag}' });`)}`,
				0,
				vi.fn(() => ({ props: {} })),
				vi.fn(),
				vi.fn(() => ({})),
			);

		const first = update('first');
		await vi.waitFor(() => expect(releases).toHaveLength(1));
		const second = update('second');
		await vi.waitFor(() => expect(releases).toHaveLength(2));
		releases[1]!();
		releases[0]!();
		await Promise.all([first, second]);

		expect(render).toHaveBeenCalledTimes(1);
		expect(render).toHaveBeenCalledWith('second');
	});

	it('does not render when the server answers with an error, so the next edit retries', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { render } = await applyDirectUpdate({ ok: false, status: 500 });

		expect(render).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});
