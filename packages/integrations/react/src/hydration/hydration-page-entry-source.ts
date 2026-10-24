import type { CompiledPageHydrationOptions } from './compiled-page-hydration-options.ts';

function assertRouterConfiguration(options: CompiledPageHydrationOptions): void {
	if (options.routerComponents && !options.routerImportPath) {
		throw new Error('routerImportPath is required when router components are configured');
	}
	if (options.routerComponents && !options.routerPropsExpression) {
		throw new Error('routerPropsExpression is required when router components are configured');
	}
}

function buildPageImport(options: CompiledPageHydrationOptions): string {
	if (options.isMdx) {
		return `import * as PageModule from ${JSON.stringify(options.importPath)};`;
	}
	return `import Page from ${JSON.stringify(options.importPath)};`;
}

function buildInitialPageBinding(options: CompiledPageHydrationOptions): string {
	if (options.isMdx) {
		return 'const initialPage = resolvePageComponent(PageModule, true, ensurePageConfigLayouts);';
	}
	return 'const initialPage = Page;';
}

function buildRouterImports(options: CompiledPageHydrationOptions): string {
	if (!options.routerComponents) return '';
	return `import { ${options.routerComponents.router}, ${options.routerComponents.pageContent} } from ${JSON.stringify(options.routerImportPath)};`;
}

function buildRouterTree(options: CompiledPageHydrationOptions): string {
	if (!options.routerComponents) {
		return 'const createTree = (Page, props) => composeLayoutPageTree(Page, props);';
	}
	return `const createTree = (Page, props) => {
  const pageContent = createElement(${options.routerComponents!.pageContent});
  return createElement(${options.routerComponents!.router}, ${options.routerPropsExpression}, pageContent);
};`;
}

function buildNormalizationImport(options: CompiledPageHydrationOptions): string {
	if (!options.isMdx) return '';
	return `import { ensurePageConfigLayouts } from ${JSON.stringify(options.pageLayoutNormalizationImportPath)};`;
}

function buildHmrOptions(options: CompiledPageHydrationOptions): string {
	if (!options.hmrEnabled) return '';
	const layoutStack = options.routerComponents
		? 'getLayoutStack: (Page) => (Page.config?.layouts ?? []).map((layout) => layout?.config?.identity?.id ?? "").join("|"),'
		: '';
	return `hmr: {
    importPath: ${JSON.stringify(options.importPath)},
    ${layoutStack}
  },`;
}

/**
 * Creates the Page entry contract consumed by the browser lifecycle.
 */
export function createPageEntrySource(options: CompiledPageHydrationOptions): string {
	assertRouterConfiguration(options);
	const pageBootstrapId = '\0ecopages-react-page-bootstrap';
	const pageDataReaderId = '\0ecopages-react-page-data-reader';

	return `
import { hydrateRoot } from ${JSON.stringify(options.reactDomClientImportPath)};
import { createElement } from ${JSON.stringify(options.reactImportPath)};
import { resolvePageComponent, startPageHydration } from ${JSON.stringify(pageBootstrapId)};
import { readPageDataDocument, getPageDataFromDocument } from ${JSON.stringify(pageDataReaderId)};
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
