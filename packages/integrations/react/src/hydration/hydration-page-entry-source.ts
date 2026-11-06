/** Complete inputs that affect a Page hydration entry's generated source. */
export type PageEntrySourceOptions = {
	importPath: string;
	pageModuleUrlExpression: string;
	scriptId: string;
	reactImportPath: string;
	reactDomClientImportPath: string;
	pageHydrationImportPath: string;
	routerImportPath?: string;
	layoutComposeImportPath: string;
	pageLayoutNormalizationImportPath: string;
	routerComponents?: { router: string; pageContent: string };
	routerPropsExpression?: string;
	hmrEnabled: boolean;
	isMdx: boolean;
};

function assertRouterConfiguration(options: PageEntrySourceOptions): void {
	if (options.routerComponents && !options.routerImportPath) {
		throw new Error('routerImportPath is required when router components are configured');
	}
	if (options.routerComponents && !options.routerPropsExpression) {
		throw new Error('routerPropsExpression is required when router components are configured');
	}
}

function buildPageImport(options: PageEntrySourceOptions): string {
	if (options.isMdx) {
		return `import * as PageModule from ${JSON.stringify(options.importPath)};`;
	}
	return `import Page from ${JSON.stringify(options.importPath)};`;
}

function buildInitialPageBinding(options: PageEntrySourceOptions): string {
	if (options.isMdx) {
		return 'const initialPage = resolvePageComponent(PageModule, true, ensurePageConfigLayouts);';
	}
	return 'const initialPage = Page;';
}

function buildRouterImports(options: PageEntrySourceOptions): string {
	if (!options.routerComponents) return '';
	return `import { ${options.routerComponents.router}, ${options.routerComponents.pageContent} } from ${JSON.stringify(options.routerImportPath)};`;
}

function buildRouterTree(options: PageEntrySourceOptions): string {
	if (!options.routerComponents) {
		return 'const createTree = (Page, props) => composeLayoutPageTree(Page, props);';
	}
	return `const createTree = (Page, props) => {
  const pageContent = createElement(${options.routerComponents!.pageContent});
  return createElement(${options.routerComponents!.router}, ${options.routerPropsExpression}, pageContent);
};`;
}

function buildNormalizationImport(options: PageEntrySourceOptions): string {
	if (!options.isMdx) return '';
	return `import { ensurePageConfigLayouts } from ${JSON.stringify(options.pageLayoutNormalizationImportPath)};`;
}

function buildHmrOptions(options: PageEntrySourceOptions): string {
	if (!options.hmrEnabled) return '';
	const layoutStack = options.routerComponents ? 'getLayouts: (Page) => Page.config?.layouts ?? [],' : '';
	return `hmr: {
    importPath: ${JSON.stringify(options.importPath)},
    ${layoutStack}
  },`;
}

/**
 * Creates the Page entry contract consumed by the browser lifecycle.
 *
 * @remarks
 * The entry only wires the Page module to `@ecopages/react/page-hydration`.
 * A production Page entry that inlines React bundles the bootstrap; every other
 * entry imports its `/assets/vendors/` URL. No server process compiles it.
 */
export function createPageEntrySource(options: PageEntrySourceOptions): string {
	assertRouterConfiguration(options);

	return `
import { hydrateRoot } from ${JSON.stringify(options.reactDomClientImportPath)};
import { createElement } from ${JSON.stringify(options.reactImportPath)};
import {
  getPageDataFromDocument,
  readPageDataDocument,
  resolvePageComponent,
  startPageHydration,
} from ${JSON.stringify(options.pageHydrationImportPath)};
${options.routerComponents ? '' : `import { composeLayoutPageTree } from ${JSON.stringify(options.layoutComposeImportPath)};`}
${buildRouterImports(options)}
${buildNormalizationImport(options)}
${buildPageImport(options)}
const pageModuleUrl = ${options.pageModuleUrlExpression};
${buildInitialPageBinding(options)}
${buildRouterTree(options)}
export default initialPage;
export const config = initialPage.config;
startPageHydration({
  scriptId: ${JSON.stringify(options.scriptId)},
  pageModuleUrl,
  Page: initialPage,
  pageDataReader: { readPageDataDocument, getPageDataFromDocument },
  runtime: { hydrateRoot, createElement },
  createTree,
  hasRouter: ${Boolean(options.routerComponents)},
  isMdx: ${options.isMdx},
  ${options.isMdx ? 'normalizePageConfig: ensurePageConfigLayouts,' : ''}
  ${buildHmrOptions(options)}
});
`.trim();
}
