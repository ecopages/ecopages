import { describe, expect, test } from 'vitest';
import { createHydrationScript, createIslandHydrationScript } from './hydration-scripts.ts';

describe('createHydrationScript', () => {
	const baseOptions = {
		importPath: '/assets/page.js',
		reactImportPath: '/assets/react.js',
		reactDomClientImportPath: '/assets/react-dom-client.js',
		isMdx: false,
	};

	test('development output passes serialized locals to layout hydration for non-router pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: true,
		});

		expect(script).toContain('window.__ecopages_page_root__ = window.__ecopages_page_root__ || null;');
		expect(script).toContain('window.__ecopages_cleanup_page_root__ = () => {');
		expect(script).toContain('activeRoot.unmount();');
		expect(script).toContain('window.__ecopages_navigation__?.releaseOwnership?.("react-router");');
		expect(script).toContain('if (window.__ecopages_page_root__) {');
		expect(script).toContain('root.render(createTree(Page, props));');
		expect(script).toContain('const layoutProps = props?.locals ? { locals: props.locals } : null;');
		expect(script).toContain('return Layout ? createElement(Layout, layoutProps, pageElement) : pageElement;');
	});

	test('development output passes serialized locals to layout hydration for non-router MDX pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: true,
			isMdx: true,
		});

		expect(script).toContain('const layoutProps = props?.locals ? { locals: props.locals } : null;');
		expect(script).toContain('return Layout ? createElement(Layout, layoutProps, pageElement) : pageElement;');
	});

	test('production output passes serialized locals to layout hydration for non-router pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: false,
		});

		expect(script).toContain('window.__ecopages_page_root__=window.__ecopages_page_root__||null;');
		expect(script).toContain('window.__ecopages_cleanup_page_root__=()=>{');
		expect(script).toContain('a.unmount()');
		expect(script).toContain('window.__ecopages_navigation__?.releaseOwnership?.("react-router")');
		expect(script).toContain(
			'if(window.__ecopages_page_root__){root=window.__ecopages_page_root__;root.render(ct(P,pr));return}',
		);
		expect(script).toContain('const lp=p?.locals?{locals:p.locals}:null;');
		expect(script).toContain('return L?ce(L,lp,pe):pe');
	});

	test('router development output exposes page-root cleanup before reuse', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: true,
			router: {
				name: 'eco-router',
				bundle: { importPath: '/assets/router.js', outputName: 'router', externals: [] },
				importMapKey: '@ecopages/react-router',
				components: { router: 'EcoRouter', pageContent: 'PageContent' },
				getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
			},
			routerImportPath: '/assets/router.js',
		});

		expect(script).toContain('window.__ecopages_cleanup_page_root__ = () => {');
		expect(script).toContain('window.__ecopages_navigation__?.register({');
		expect(script).toContain('window.__ecopages_navigation__?.claimOwnership?.("react-router");');
		expect(script).toContain(
			'window.__ecopages_navigation__?.reloadCurrentPage?.({ clearCache: false, source: "react-router" });',
		);
	});

	test('production output passes serialized locals to layout hydration for non-router MDX pages', () => {
		const script = createHydrationScript({
			...baseOptions,
			isDevelopment: false,
			isMdx: true,
		});

		expect(script).toContain('const lp=p?.locals?{locals:p.locals}:null;');
		expect(script).toContain('return L?ce(L,lp,pe):pe');
	});
});

describe('createIslandHydrationScript', () => {
	const baseOptions = {
		importPath: '/assets/component.js',
		reactImportPath: '/assets/react.js',
		reactDomClientImportPath: '/assets/react-dom-client.js',
		targetSelector: '[data-eco-component-id="eco-component-1"]',
		props: { count: 3 },
		componentRef: 'component-ref',
		componentFile: '/app/component.tsx',
	};

	test('development output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			isDevelopment: true,
		});

		expect(script).toContain('document.addEventListener("eco:after-swap", mount);');
		expect(script).toContain('document.createElement("eco-island")');
		expect(script).toContain('container.style.display = "block"');
		expect(script).toContain('target.replaceWith(container)');
		expect(script).toContain('JSON.parse(atob(target.getAttribute("data-eco-props")');
		expect(script).toContain('document.addEventListener("DOMContentLoaded", mount, { once: true });');
	});

	test('production output mounts on initial load and after swap', () => {
		const script = createIslandHydrationScript({
			...baseOptions,
			isDevelopment: false,
		});

		expect(script).toContain('document.addEventListener("eco:after-swap",m)');
		expect(script).toContain('createElement("eco-island")');
		expect(script).toContain('style.display="block"');
		expect(script).toContain('replaceWith(ct)');
		expect(script).toContain('JSON.parse(atob(t.getAttribute("data-eco-props")');
		expect(script).toContain('DOMContentLoaded",m,{once:true}');
	});
});
