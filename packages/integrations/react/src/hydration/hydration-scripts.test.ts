import { describe, expect, test } from 'vitest';
import { assertNoBareEcopagesImports } from './assert-no-bare-ecopages-imports.ts';
import { createHydrationScript, createIslandHydrationScript } from './hydration-scripts.ts';

describe('createHydrationScript', () => {
	const baseOptions = {
		importPath: '/assets/page.js',
		scriptId: 'ecopages-react-page',
		reactImportPath: '/assets/react.js',
		reactDomClientImportPath: '/assets/react-dom-client.js',
		layoutComposeImportPath: '@ecopages/react/layout-compose',
		pageLayoutNormalizationImportPath: '@ecopages/core/eco/page-layout-normalization',
		isMdx: false,
	};

	const browserHelperImports = {
		layoutComposeImportPath: '/assets/vendors/layout-compose.js',
		pageLayoutNormalizationImportPath: '/assets/vendors/page-layout-normalization.js',
	};

	test('development output passes serialized locals to layout hydration for non-router pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			...browserHelperImports,
			hmrEnabled: true,
		});

		expect(script).toContain('window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};');
		expect(script).toContain('export default Page;');
		expect(script).toContain('const pageModuleUrl = import.meta.url;');
		expect(script).toContain('const isActivePageEntry = Boolean(document.querySelector');
		expect(script).toContain('window.__ECO_PAGES__.react.pageRoot = window.__ECO_PAGES__.react.pageRoot || null;');
		expect(script).toContain('window.__ECO_PAGES__.react.cleanupPageRoot = () => {');
		expect(script).toContain('activeRoot.unmount();');
		expect(script).toContain('window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router");');
		expect(script).toContain('if (window.__ECO_PAGES__.react?.pageRoot) {');
		expect(script).toContain('const initialPageData = readPageDataDocument();');
		expect(script).toContain('const props = initialPageData.props;');
		expect(script).toContain('window.__ECO_PAGES__.page = {');
		expect(script).toContain('root.render(createTree(Page, props));');
		expect(script).toContain('import { composeLayoutPageTree } from "/assets/vendors/layout-compose.js";');
		expect(script).toContain('const createTree = (Component, props) => composeLayoutPageTree(Component, props);');
		expect(script).toContain('window.__ECO_PAGES__.hmrHandlers');
		assertNoBareEcopagesImports(script);
	});

	test('development MDX output emits vendor layout normalization imports', () => {
		const script = createHydrationScript({
			...baseOptions,
			...browserHelperImports,
			hmrEnabled: true,
			isMdx: true,
		});

		expect(script).toContain('import { composeLayoutPageTree } from "/assets/vendors/layout-compose.js";');
		expect(script).toContain(
			'import { ensurePageConfigLayouts } from "/assets/vendors/page-layout-normalization.js";',
		);
		expect(script).toContain('import * as MDXModule from "/assets/page.js";');
		expect(script).toContain('ensurePageConfigLayouts(Page.config);');
		expect(script).toContain('const createTree = (Component, props) => composeLayoutPageTree(Component, props);');
		assertNoBareEcopagesImports(script);
	});

	test('non-HMR output is readable and omits HMR handlers for non-router pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			hmrEnabled: false,
		});

		expect(script).toContain('window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};');
		expect(script).toContain('export default Page;');
		expect(script).toContain('module: initialPageData.moduleUrl || pageModuleUrl');
		expect(script).toContain('window.__ECO_PAGES__.react.pageRoot = window.__ECO_PAGES__.react.pageRoot || null;');
		expect(script).toContain('window.__ECO_PAGES__.react.cleanupPageRoot = () => {');
		expect(script).toContain('activeRoot.unmount();');
		expect(script).toContain('window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router");');
		expect(script).toContain('root.render(createTree(Page, props));');
		expect(script).toContain('import { composeLayoutPageTree } from "@ecopages/react/layout-compose";');
		expect(script).toContain('const createTree = (Component, props) => composeLayoutPageTree(Component, props);');
		expect(script).not.toContain('hmrHandlers');
	});

	test('router development output exposes page-root cleanup before reuse', () => {
		const script = createHydrationScript({
			...baseOptions,
			...browserHelperImports,
			hmrEnabled: true,
			router: {
				name: 'eco-router',
				bundle: { importPath: '/assets/router.js', outputName: 'router', externals: [] },
				components: { router: 'EcoRouter', pageContent: 'PageContent' },
				getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
			},
			routerImportPath: '/assets/router.js',
		});

		expect(script).toContain('window.__ECO_PAGES__.react.cleanupPageRoot = () => {');
		expect(script).toContain('export default Page;');
		expect(script).toContain('const currentOwnerState = window.__ECO_PAGES__?.navigation?.getOwnerState?.();');
		expect(script).toContain(
			'if (!(currentOwnerState?.owner === "react-router" && currentOwnerState.canHandleSpaNavigation)) {',
		);
		expect(script).toContain('const shouldReuseExistingRouterRoot = () => {');
		expect(script).toContain('if (shouldReuseExistingRouterRoot()) {');
		expect(script).toContain('window.__ECO_PAGES__?.navigation?.register({');
		expect(script).toContain('window.__ECO_PAGES__?.navigation?.claimOwnership?.("react-router");');
		expect(script).toContain('const currentPageLayoutStack = (Component) =>');
		expect(script).toContain("layout?.config?.__eco?.file ?? '').join('|')");
		expect(script).toContain('clearCache: currentPageLayoutStackKey !== nextPageLayoutStackKey');
		expect(script).toContain('moduleUrl: newUrl');
		expect(script).toContain('const initialPageData = readPageDataDocument();');
		expect(script).toContain('const props = initialPageData.props;');
		expect(script).toContain('window.__ECO_PAGES__.page = {');
		expect(script).toContain('const nextProps = getPageData();');
		expect(script).toContain('root.render(createTree(NewPage, nextProps));');
		expect(script).toContain('console.log("[ecopages] React component updated via router");');
		expect(script).toContain('const readPageDataDocument = () => {');
		expect(script).toContain('parsed.schemaVersion === 1');
		expect(script).toContain('moduleUrl: parsed.moduleUrl');
		expect(script).not.toContain('@ecopages/react/page-data-reader');
		expect(script).toContain('module: initialPageData.moduleUrl || pageModuleUrl');
		expect(script).not.toContain('__ECO_PAGE_DATA_FALLBACK__');
		assertNoBareEcopagesImports(script);
	});

	test('non-HMR output passes serialized locals to layout hydration for non-router MDX pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			hmrEnabled: false,
			isMdx: true,
		});

		expect(script).toContain('import { composeLayoutPageTree } from "@ecopages/react/layout-compose";');
		expect(script).toContain('const createTree = (Component, props) => composeLayoutPageTree(Component, props);');
		expect(script).toContain('import * as MDXModule from "/assets/page.js";');
	});

	test('router non-HMR output reuses an active router-owned root during rerun bootstraps', () => {
		const script = createHydrationScript({
			...baseOptions,
			hmrEnabled: false,
			router: {
				name: 'eco-router',
				bundle: { importPath: '/assets/router.js', outputName: 'router', externals: [] },
				components: { router: 'EcoRouter', pageContent: 'PageContent' },
				getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
			},
			routerImportPath: '/assets/router.js',
		});

		expect(script).toContain('const shouldReuseExistingRouterRoot = () => {');
		expect(script).toContain('if (shouldReuseExistingRouterRoot()) {');
		expect(script).toContain('window.__ECO_PAGES__.page = {');
		expect(script).toContain('module: pageData.moduleUrl || pageModuleUrl');
		expect(script).not.toContain('hmrHandlers');
	});

	test('router non-HMR output can emit an explicit page module URL expression', () => {
		const script = createHydrationScript({
			...baseOptions,
			hmrEnabled: false,
			pageModuleUrlExpression: '"/src/pages/react-notes.react.tsx"',
			router: {
				name: 'eco-router',
				bundle: { importPath: '/assets/router.js', outputName: 'router', externals: [] },
				components: { router: 'EcoRouter', pageContent: 'PageContent' },
				getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
			},
			routerImportPath: '/assets/router.js',
		});

		expect(script).toContain('const pageModuleUrl = "/src/pages/react-notes.react.tsx";');
		expect(script).toContain('module: pageData.moduleUrl || pageModuleUrl');
	});
});

describe('createIslandHydrationScript', () => {
	const baseOptions = {
		importPath: '/assets/component.js',
		scriptId: 'ecopages-react-island',
		reactImportPath: '/assets/react.js',
		reactDomClientImportPath: '/assets/react-dom-client.js',
		targetSelector: '[data-eco-component-key="eco-component-1"]',
		componentRef: 'component-ref',
		componentFile: '/app/component.tsx',
	};

	test('readable island output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			minify: false,
		});

		expect(script).not.toContain('eco:after-swap');
		expect(script).toContain('document.createElement("eco-island")');
		expect(script).toContain('container.style.display = "block"');
		expect(script).toContain('document.querySelectorAll');
		expect(script).toContain('target.replaceWith(container)');
		expect(script).toContain('JSON.parse(atob(target.getAttribute("data-eco-props")');
		expect(script).toContain('window.__ECO_PAGES__.rerunScripts["ecopages-react-island"] = mount;');
		expect(script).toContain('document.addEventListener("DOMContentLoaded", mount, { once: true });');
	});

	test('compact island output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			minify: true,
		});

		expect(script).not.toContain('eco:after-swap');
		expect(script).toContain('createElement("eco-island")');
		expect(script).toContain('style.display="block"');
		expect(script).toContain('querySelectorAll');
		expect(script).toContain('replaceWith(ct)');
		expect(script).toContain('JSON.parse(atob(t.getAttribute("data-eco-props")');
		expect(script).toContain('window.__ECO_PAGES__.rerunScripts["ecopages-react-island"]=m;');
		expect(script).toContain('DOMContentLoaded",m,{once:true}');
	});
});
