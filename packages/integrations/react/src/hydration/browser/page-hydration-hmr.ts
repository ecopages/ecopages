import type { PageHydrationOptions } from './page-hydration.ts';
import { resolvePageComponent } from './page-hydration-module.ts';

type PageWindowRuntime = {
	navigation?: {
		getOwnerState?: () => { owner: string };
		reloadCurrentPage?: (options: Record<string, unknown>) => Promise<void> | void;
	};
	react?: { pageRoot?: { render: (tree: unknown) => void } | null; mountGeneration?: number };
	page?: { module: string; props: Record<string, unknown>; document?: Document };
};

type PageWindow = Window & { __ECO_PAGES__?: PageWindowRuntime };

/**
 * Numbers the updates so the newest one wins.
 *
 * @remarks
 * An update awaits an import and, without a router, a fetch, and the HMR client does not queue the next message.
 * Two saves in a row can finish out of order; an update that finds a newer one started drops itself.
 */
let latestUpdate = 0;

function getRuntime(): PageWindowRuntime {
	return ((window as PageWindow).__ECO_PAGES__ ??= {});
}

function isCurrentMountGeneration(generation: number): boolean {
	return (getRuntime().react?.mountGeneration ?? 0) === generation;
}

/**
 * @remarks
 * A layout module has one URL, so an unchanged layout is the same function in both page versions.
 */
function haveSameLayouts(current: readonly unknown[], next: readonly unknown[]): boolean {
	return current.length === next.length && current.every((layout, index) => layout === next[index]);
}

async function applyRouterHmrUpdate(
	options: PageHydrationOptions,
	newUrl: string,
	currentPage: unknown,
	nextPage: unknown,
): Promise<boolean> {
	if (!options.hasRouter || getRuntime().navigation?.getOwnerState?.().owner !== 'react-router') {
		return false;
	}

	const currentLayouts = options.hmr!.getLayouts?.(currentPage) ?? [];
	const nextLayouts = options.hmr!.getLayouts?.(nextPage) ?? [];
	await getRuntime().navigation?.reloadCurrentPage?.({
		clearCache: !haveSameLayouts(currentLayouts, nextLayouts),
		moduleUrl: newUrl,
		source: 'react-router',
	});
	console.log(`[ecopages] ${options.isMdx ? 'MDX' : 'React'} component updated via router`);
	return true;
}

/**
 * Fetches the current URL and parses it, so a direct re-render has the server HTML of its Foreign Subtrees.
 *
 * @remarks
 * A direct update has no router to refetch the document. The Foreign Subtree boundaries of the edited Page read
 * their server HTML from it: an edit can change a Foreign Child's props, so the boundary has no HTML in the live
 * document, and the live boundary of a hydrated custom element no longer holds its declarative shadow root. The
 * parsed document keeps the `<template shadowrootmode>` of each, as a client navigation's does. A response that is
 * not a page, such as a server render error, throws, so the update is not applied and the next edit retries it.
 */
async function fetchCurrentDocument(): Promise<Document> {
	const response = await fetch(window.location.href, { headers: { accept: 'text/html' }, cache: 'no-store' });
	if (!response.ok) {
		throw new Error(`The server answered ${response.status} for ${window.location.pathname}`);
	}
	return new DOMParser().parseFromString(await response.text(), 'text/html');
}

async function applyDirectHmrRender(
	options: PageHydrationOptions,
	nextPage: unknown,
	nextProps: Record<string, unknown>,
	readPageData: (options: PageHydrationOptions) => { moduleUrl?: string; props: Record<string, unknown> },
	setPageState: (
		options: PageHydrationOptions,
		pageData: { moduleUrl?: string; props: Record<string, unknown> },
	) => void,
	generation: number,
	isSuperseded: () => boolean,
): Promise<void> {
	if (!getRuntime().react?.pageRoot || !isCurrentMountGeneration(generation)) return;
	const fetchedDocument = await fetchCurrentDocument();
	const activeRoot = getRuntime().react?.pageRoot ?? null;
	if (!activeRoot || !isCurrentMountGeneration(generation) || isSuperseded()) return;
	setPageState(options, readPageData(options));
	const runtime = getRuntime();
	if (runtime.page) runtime.page.document = fetchedDocument;
	activeRoot.render(options.createTree(nextPage, nextProps));
	console.log(`[ecopages] ${options.isMdx ? 'MDX' : 'React'} component updated`);
}

/**
 * Imports and applies one HMR page update.
 */
export async function handlePageHmr(
	options: PageHydrationOptions,
	newUrl: string,
	generation: number,
	readPageData: (options: PageHydrationOptions) => { moduleUrl?: string; props: Record<string, unknown> },
	setPageState: (
		options: PageHydrationOptions,
		pageData: { moduleUrl?: string; props: Record<string, unknown> },
	) => void,
	getPageDataFromDocument: (options: PageHydrationOptions) => Record<string, unknown>,
): Promise<void> {
	if (!options.hmr || !isCurrentMountGeneration(generation)) return;
	const update = ++latestUpdate;
	const isSuperseded = () => update !== latestUpdate;
	try {
		const newModule = (await import(/* @vite-ignore */ newUrl)) as Record<string, unknown>;
		if (!isCurrentMountGeneration(generation) || isSuperseded()) return;
		const nextPage = resolvePageComponent(newModule, options.isMdx, options.normalizePageConfig);
		const currentPage = options.Page;
		options.Page = nextPage;

		if (await applyRouterHmrUpdate(options, newUrl, currentPage, nextPage)) {
			return;
		}

		await applyDirectHmrRender(
			options,
			nextPage,
			getPageDataFromDocument(options),
			readPageData,
			setPageState,
			generation,
			isSuperseded,
		);
	} catch (error) {
		console.error(`[ecopages] Failed to hot-reload ${options.isMdx ? 'MDX' : 'React'} component:`, error);
	}
}
