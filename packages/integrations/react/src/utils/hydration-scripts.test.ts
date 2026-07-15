import { describe, expect, test } from 'vitest';
import { createHydrationScript, createIslandHydrationScript } from './hydration-scripts.ts';

describe('createHydrationScript', () => {
	const baseOptions = {
		importPath: '/assets/page.js',
		scriptId: 'ecopages-react-page',
		reactImportPath: '/assets/react.js',
		reactDomClientImportPath: '/assets/react-dom-client.js',
		isMdx: false,
	};

	test('development output passes serialized locals to layout hydration for non-router pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: true,
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
		expect(script).toContain('import { composeLayoutPageTree } from "@ecopages/react/layout-compose";');
		expect(script).toContain('const createTree = (Component, props) => composeLayoutPageTree(Component, props);');
	});

	test('development output passes serialized locals to layout hydration for non-router MDX pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: true,
			isMdx: true,
		});

		expect(script).toContain('import { composeLayoutPageTree } from "@ecopages/react/layout-compose";');
		expect(script).toContain('const createTree = (Component, props) => composeLayoutPageTree(Component, props);');
	});

	test('production output passes serialized locals to layout hydration for non-router pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: false,
		});

		expect(script).toContain('window.__ECO_PAGES__=window.__ECO_PAGES__||{};');
		expect(script).toContain('export default P;');
		expect(script).toContain('window.__ECO_PAGES__.react.pageRoot=window.__ECO_PAGES__.react.pageRoot||null;');
		expect(script).toContain('window.__ECO_PAGES__.react.cleanupPageRoot=()=>{');
		expect(script).toContain('a.unmount()');
		expect(script).toContain('window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router")');
		expect(script).toContain(
			'const pd=rd();const pr=pd.props;window.__ECO_PAGES__.page={module:pd.moduleUrl||u,props:pr};',
		);
		expect(script).toContain(
			'if(window.__ECO_PAGES__.react?.pageRoot){root=window.__ECO_PAGES__.react.pageRoot;root.render(ct(P,pr));return}',
		);
		expect(script).toContain('import{composeLayoutPageTree as clp}from"@ecopages/react/layout-compose"');
		expect(script).toContain('const ct=(C,p)=>clp(C,p)');
	});

	test('router development output exposes page-root cleanup before reuse', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: true,
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
	});

	test('production output passes serialized locals to layout hydration for non-router MDX pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: false,
			isMdx: true,
		});

		expect(script).toContain('import{composeLayoutPageTree as clp}from"@ecopages/react/layout-compose"');
		expect(script).toContain('const ct=(C,p)=>clp(C,p)');
	});

	test('router production output reuses an active router-owned root during rerun bootstraps', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: false,
			router: {
				name: 'eco-router',
				bundle: { importPath: '/assets/router.js', outputName: 'router', externals: [] },
				components: { router: 'EcoRouter', pageContent: 'PageContent' },
				getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
			},
			routerImportPath: '/assets/router.js',
		});

		expect(script).toContain('const sr=()=>{');
		expect(script).toContain(
			'const pd=rd();const pr=pd.props;window.__ECO_PAGES__.page={module:pd.moduleUrl||u,props:pr};',
		);
		expect(script).toContain('if(sr()){root=window.__ECO_PAGES__.react.pageRoot;return}');
	});

	test('router production output can emit an explicit page module URL expression', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: false,
			pageModuleUrlExpression: '"/src/pages/react-notes.react.tsx"',
			router: {
				name: 'eco-router',
				bundle: { importPath: '/assets/router.js', outputName: 'router', externals: [] },
				components: { router: 'EcoRouter', pageContent: 'PageContent' },
				getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
			},
			routerImportPath: '/assets/router.js',
		});

		expect(script).toContain('const u="/src/pages/react-notes.react.tsx";');
		expect(script).toContain('window.__ECO_PAGES__.page={module:pd.moduleUrl||u,props:pr};');
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

	test('development output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			isDevelopment: true,
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

	test('production output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			isDevelopment: false,
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
