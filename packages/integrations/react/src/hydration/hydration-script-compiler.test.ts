import { describe, expect, it } from 'vitest';
import { IslandHydrationScriptCompiler, PageHydrationScriptCompiler } from './hydration-script-compiler.ts';

const options = {
	importPath: '/assets/component.js',
	scriptId: 'island-script',
	reactImportPath: '/assets/react.js',
	reactDomClientImportPath: '/assets/react-dom-client.js',
	targetSelector: '[data-eco-component-key="component"]',
	componentRef: 'Component',
	componentFile: '/app/Component.tsx',
};

describe('compileIslandHydrationScript', () => {
	const compiler = new IslandHydrationScriptCompiler();

	it('compiles the editable browser lifecycle and keeps application modules external', async () => {
		const script = await compiler.compile({ ...options, minify: false });

		expect(script).toContain('hydrateRoot');
		expect(script).toContain('data-eco-hydrated');
		expect(script).toContain('from "/assets/react.js"');
		expect(script).toContain('from "/assets/react-dom-client.js"');
		expect(script).toContain('from "/assets/component.js"');
		expect(script).not.toContain('@ecopages/');
		expect(script).not.toContain('createRoot');
	});

	it('uses the same lifecycle source for compact output', async () => {
		const script = await compiler.compile({ ...options, minify: true });

		expect(script.length).toBeLessThan((await compiler.compile({ ...options, minify: false })).length);
		expect(script).toContain('hydrateRoot');
		expect(script).not.toContain('createRoot');
	});

	it.each([false, true])('executes the %s island output through the browser bootstrap', async (minify) => {
		const compiler = new IslandHydrationScriptCompiler();
		const dataUrl = (source: string) => `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
		const reactUrl = dataUrl(`
			export const createElement = (type, props) => ({ type, props });
			export const useEffect = () => {};
		`);
		const reactDomUrl = dataUrl('export const hydrateRoot = () => ({ render() {}, unmount() {} });');
		const componentUrl = dataUrl('export default function Component() {}');
		type TestGlobal = {
			window?: unknown;
			document?: unknown;
			__ECO_PAGES__?: unknown;
		};
		const globalScope = globalThis as unknown as TestGlobal;
		const previous = {
			window: globalScope.window,
			document: globalScope.document,
			pages: globalScope.__ECO_PAGES__,
		};
		globalScope.window = globalScope;
		globalScope.document = {
			readyState: 'complete',
			querySelectorAll: () => [],
		};
		delete globalScope.__ECO_PAGES__;

		try {
			const scriptId = `compiled-island-${minify}`;
			const script = await compiler.compile({
				importPath: componentUrl,
				scriptId,
				reactImportPath: reactUrl,
				reactDomClientImportPath: reactDomUrl,
				targetSelector: '[data-eco-component-key="component"]',
				minify,
			});
			await import(dataUrl(script));
			const pageRuntime = globalScope.__ECO_PAGES__ as {
				islandComponents: Record<string, unknown>;
				rerunScripts: Record<string, unknown>;
			};
			expect(pageRuntime.islandComponents[scriptId]).toBeTypeOf('function');
			expect(pageRuntime.rerunScripts[scriptId]).toBeTypeOf('function');
		} finally {
			if (previous.window === undefined) delete globalScope.window;
			else globalScope.window = previous.window;
			if (previous.document === undefined) delete globalScope.document;
			else globalScope.document = previous.document;
			if (previous.pages === undefined) delete globalScope.__ECO_PAGES__;
			else globalScope.__ECO_PAGES__ = previous.pages;
		}
	});
});

describe('PageHydrationScriptCompiler', () => {
	it('uses the same editable page lifecycle for readable and minified output', async () => {
		const compiler = new PageHydrationScriptCompiler();
		const options = {
			importPath: '/assets/page.js',
			pageModuleUrlExpression: 'import.meta.url',
			scriptId: 'page-script',
			reactImportPath: '/assets/react.js',
			reactDomClientImportPath: '/assets/react-dom-client.js',
			layoutComposeImportPath: '/assets/layout-compose.js',
			pageLayoutNormalizationImportPath: '/assets/page-layout-normalization.js',
			hmrEnabled: true,
			isMdx: false,
			hasPagePreload: false,
		};

		const readable = await compiler.compile({ ...options, minify: false });
		const minified = await compiler.compile({ ...options, minify: true });

		expect(readable).toContain('startPageHydration');
		expect(readable).toContain('from "/assets/page.js"');
		expect(readable).toContain('newUrl');
		expect(readable).not.toContain('@ecopages/');
		expect(minified).toContain('hydrateRoot');
		expect(minified).toContain('/assets/page.js');
		expect(minified.length).toBeLessThan(readable.length);
	});

	it('preserves a named preload export for non-MDX pages', async () => {
		const compiler = new PageHydrationScriptCompiler();
		const script = await compiler.compile({
			importPath: '/assets/page-with-preload.js',
			pageModuleUrlExpression: 'import.meta.url',
			scriptId: 'page-with-preload',
			reactImportPath: '/assets/react.js',
			reactDomClientImportPath: '/assets/react-dom-client.js',
			layoutComposeImportPath: '/assets/layout-compose.js',
			pageLayoutNormalizationImportPath: '/assets/page-layout-normalization.js',
			hmrEnabled: false,
			isMdx: false,
			hasPagePreload: true,
			minify: false,
		});

		expect(script).toContain('import * as PageModule from "/assets/page-with-preload.js"');
		expect(script).toContain('preload: initialPage.preload');
		expect(script).toContain('preload');
	});

	it.each([false, true])('executes the %s output through the browser bootstrap', async (minify) => {
		const compiler = new PageHydrationScriptCompiler();
		const dataUrl = (source: string) => `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
		const reactUrl = dataUrl(`
			export const createElement = (type, props) => ({ type, props });
		`);
		const reactDomUrl = dataUrl(`
			export const hydrateRoot = () => {
				globalThis.__ecopagesCompiledHydrateCount = (globalThis.__ecopagesCompiledHydrateCount ?? 0) + 1;
				return { render() {}, unmount() {} };
			};
		`);
		const pageUrl = dataUrl('export default function Page() {}');
		const layoutUrl = dataUrl('export const composeLayoutPageTree = (Page, props) => ({ Page, props });');
		type TestGlobal = {
			window?: unknown;
			document?: unknown;
			__ecopagesCompiledHydrateCount?: number;
			__ECO_PAGES__?: unknown;
		};
		const globalScope = globalThis as unknown as TestGlobal;
		const previous = {
			window: globalScope.window,
			document: globalScope.document,
			count: globalScope.__ecopagesCompiledHydrateCount,
			pages: globalScope.__ECO_PAGES__,
		};
		globalScope.window = globalScope;
		globalScope.document = {
			readyState: 'complete',
			body: {},
			querySelector: () => ({}),
			getElementById: () => null,
		};
		globalScope.__ecopagesCompiledHydrateCount = 0;
		delete globalScope.__ECO_PAGES__;

		try {
			const script = await compiler.compile({
				importPath: pageUrl,
				pageModuleUrlExpression: JSON.stringify(pageUrl),
				scriptId: `compiled-page-${minify}`,
				reactImportPath: reactUrl,
				reactDomClientImportPath: reactDomUrl,
				layoutComposeImportPath: layoutUrl,
				pageLayoutNormalizationImportPath: layoutUrl,
				hmrEnabled: false,
				isMdx: false,
				hasPagePreload: false,
				minify,
			});
			await import(dataUrl(script));
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(globalScope.__ecopagesCompiledHydrateCount).toBe(1);
		} finally {
			if (previous.window === undefined) delete globalScope.window;
			else globalScope.window = previous.window;
			if (previous.document === undefined) delete globalScope.document;
			else globalScope.document = previous.document;
			if (previous.count === undefined) delete globalScope.__ecopagesCompiledHydrateCount;
			else globalScope.__ecopagesCompiledHydrateCount = previous.count;
			if (previous.pages === undefined) delete globalScope.__ECO_PAGES__;
			else globalScope.__ECO_PAGES__ = previous.pages;
		}
	});
});
