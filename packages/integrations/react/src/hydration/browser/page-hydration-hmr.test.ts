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
