import type { PageHydrationOptions } from './page-hydration.ts';
import { resolvePageModule } from './page-hydration-module.ts';

type PageWindowRuntime = {
	navigation?: {
		getOwnerState?: () => { owner: string };
		reloadCurrentPage?: (options: Record<string, unknown>) => Promise<void> | void;
	};
	react?: { pageRoot?: { render: (tree: unknown) => void } | null; mountGeneration?: number };
	page?: { module: string; props: Record<string, unknown> };
};

type PageWindow = Window & { __ECO_PAGES__?: PageWindowRuntime };

function getRuntime(): PageWindowRuntime {
	return ((window as PageWindow).__ECO_PAGES__ ??= {});
}

function isCurrentMountGeneration(generation: number): boolean {
	return (getRuntime().react?.mountGeneration ?? 0) === generation;
}

async function applyRouterHmrUpdate(
	options: PageHydrationOptions,
	newUrl: string,
	currentPage: unknown,
	nextPage: ReturnType<typeof resolvePageModule>,
	_nextProps: Record<string, unknown>,
): Promise<boolean> {
	if (!options.hasRouter || getRuntime().navigation?.getOwnerState?.().owner !== 'react-router') {
		return false;
	}

	const currentLayoutStack = options.hmr!.getLayoutStack?.(currentPage) ?? '';
	const nextLayoutStack = options.hmr!.getLayoutStack?.(nextPage.Page) ?? '';
	await getRuntime().navigation?.reloadCurrentPage?.({
		clearCache: currentLayoutStack !== nextLayoutStack,
		moduleUrl: newUrl,
		source: 'react-router',
	});
	console.log(`[ecopages] ${options.isMdx ? 'MDX' : 'React'} component updated via router`);
	return true;
}

function applyDirectHmrRender(
	options: PageHydrationOptions,
	nextPage: ReturnType<typeof resolvePageModule>,
	nextProps: Record<string, unknown>,
	readPageData: (options: PageHydrationOptions) => { moduleUrl?: string; props: Record<string, unknown> },
	setPageState: (
		options: PageHydrationOptions,
		pageData: { moduleUrl?: string; props: Record<string, unknown> },
	) => void,
	generation: number,
): void {
	const activeRoot = getRuntime().react?.pageRoot ?? null;
	if (!activeRoot || !isCurrentMountGeneration(generation)) return;
	setPageState(options, readPageData(options));
	activeRoot.render(options.createTree(nextPage.Page, nextProps));
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
	try {
		const newModule = (await import(/* @vite-ignore */ newUrl)) as Record<string, unknown>;
		if (!isCurrentMountGeneration(generation)) return;
		const nextPage = resolvePageModule(newModule, options.isMdx, options.normalizePageConfig);
		const nextProps = getPageDataFromDocument(options);
		await nextPage.preload?.(nextProps);
		if (!isCurrentMountGeneration(generation)) return;
		const currentPage = options.Page;
		options.Page = nextPage.Page;
		options.preload = nextPage.preload;

		if (await applyRouterHmrUpdate(options, newUrl, currentPage, nextPage, nextProps)) {
			return;
		}

		applyDirectHmrRender(options, nextPage, nextProps, readPageData, setPageState, generation);
	} catch (error) {
		console.error(`[ecopages] Failed to hot-reload ${options.isMdx ? 'MDX' : 'React'} component:`, error);
	}
}
