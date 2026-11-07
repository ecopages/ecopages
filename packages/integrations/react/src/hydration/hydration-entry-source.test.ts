import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIslandEntrySource } from './hydration-island-entry-source.ts';
import { createPageEntrySource } from './hydration-page-entry-source.ts';

const dataUrl = (source: string) => `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
const islandHydrationUrl = new URL('./browser/island-hydration.ts', import.meta.url).href;
const pageHydrationUrl = new URL('./browser/page-hydration.ts', import.meta.url).href;

const reactDomUrl = dataUrl(`
	export const hydrateRoot = () => {
		globalThis.__ecopagesHydrateCount += 1;
		return { render() {}, unmount() {} };
	};
`);

/** Points each package import of a generated entry at a stand-in module, as the bundler or the dev rewrite would. */
function linkImports(source: string, modules: Record<string, string>): string {
	let linked = source;
	for (const [specifier, url] of Object.entries(modules)) {
		linked = linked.replaceAll(`from ${JSON.stringify(specifier)}`, `from ${JSON.stringify(url)}`);
	}
	return linked;
}

type PageRuntime = {
	islandComponents?: Record<string, unknown>;
	hmrHandlers?: Record<string, unknown>;
};

beforeEach(() => {
	vi.stubGlobal('window', globalThis);
	vi.stubGlobal('__ecopagesHydrateCount', 0);
	vi.stubGlobal('__ECO_PAGES__', undefined);
});

function readHydrateCount(): number {
	return (globalThis as { __ecopagesHydrateCount?: number }).__ecopagesHydrateCount ?? 0;
}

function readPageRuntime(): PageRuntime {
	return (globalThis as { __ECO_PAGES__?: PageRuntime }).__ECO_PAGES__ ?? {};
}

describe('createIslandEntrySource', () => {
	it.each([false, true])('hydrates the Island Host through the bootstrap it imports (HMR %s)', async (hmrEnabled) => {
		const host = { getAttribute: () => null };
		vi.stubGlobal('document', { readyState: 'complete', querySelectorAll: () => [host] });
		const scriptId = `island-entry-${hmrEnabled}`;
		const importPath = dataUrl(`export default function Component() {} // ${scriptId}`);

		const source = createIslandEntrySource({
			importPath,
			scriptId,
			targetSelector: '[data-eco-component-key="component"]',
			hmrEnabled,
		});

		await import(
			dataUrl(
				linkImports(source, {
					react: dataUrl(
						'export const createElement = () => ({}); export const useEffect = () => {}; export const useState = () => []; export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = { H: null };',
					),
					'react-dom/client': reactDomUrl,
					'@ecopages/react/island-hydration': islandHydrationUrl,
				}),
			)
		);

		expect(readHydrateCount()).toBe(1);
		expect(readPageRuntime().islandComponents?.[scriptId]).toBeTypeOf('function');
		expect(readPageRuntime().hmrHandlers?.[importPath] !== undefined).toBe(hmrEnabled);
	});
});

describe('createPageEntrySource', () => {
	it.each([
		{ hmrEnabled: false, isMdx: false },
		{ hmrEnabled: true, isMdx: false },
		{ hmrEnabled: false, isMdx: true },
	])('hydrates the Page through the bootstrap it imports (%o)', async ({ hmrEnabled, isMdx }) => {
		vi.stubGlobal('document', {
			readyState: 'complete',
			body: { childNodes: [] },
			querySelector: () => ({}),
			getElementById: () => null,
		});
		vi.stubGlobal('location', { pathname: '/', search: '' });
		const scriptId = `page-entry-${hmrEnabled}-${isMdx}`;
		const pageUrl = dataUrl(`export default function Page() {} export const config = {}; // ${scriptId}`);

		const source = createPageEntrySource({
			importPath: pageUrl,
			pageModuleUrlExpression: JSON.stringify(pageUrl),
			scriptId,
			hmrEnabled,
			isMdx,
		});

		await import(
			dataUrl(
				linkImports(source, {
					react: dataUrl(
						'export const createElement = () => ({}); export const useState = () => []; export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = { H: null };',
					),
					'react-dom/client': reactDomUrl,
					'@ecopages/react/page-hydration': pageHydrationUrl,
					'@ecopages/react/layout-compose': dataUrl('export const composeLayoutPageTree = () => ({});'),
					'@ecopages/core/client': dataUrl('export const ensurePageConfigLayouts = () => {};'),
				}),
			)
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(readHydrateCount()).toBe(1);
	});
});
