import { readFileSync } from 'node:fs';
import { rolldown, type LoadResult, type Plugin } from 'rolldown';

const ISLAND_BOOTSTRAP_ID = '\0ecopages-react-island-bootstrap';
const PAGE_BOOTSTRAP_ID = '\0ecopages-react-page-bootstrap';
const PAGE_DATA_READER_ID = '\0ecopages-react-page-data-reader';
const PAGE_DATA_MANIFEST_ID = '\0ecopages-react-page-data-manifest';

/** Complete inputs that affect an Island Host script's generated source. */
export type CompiledIslandHydrationOptions = {
	importPath: string;
	scriptId: string;
	reactImportPath: string;
	reactDomClientImportPath: string;
	targetSelector: string;
	componentRef?: string;
	componentFile?: string;
	minify: boolean;
	hmrEnabled?: boolean;
};

/** Complete inputs that affect a Page hydration script's generated source. */
export type CompiledPageHydrationOptions = {
	importPath: string;
	pageModuleUrlExpression: string;
	scriptId: string;
	reactImportPath: string;
	reactDomClientImportPath: string;
	routerImportPath?: string;
	layoutComposeImportPath: string;
	pageLayoutNormalizationImportPath: string;
	routerComponents?: { router: string; pageContent: string };
	routerPropsExpression?: string;
	hmrEnabled: boolean;
	isMdx: boolean;
	hasPagePreload: boolean;
	minify: boolean;
};

/** Serializes every compilation input so source/config changes cannot reuse stale output. */
function getCacheKey(options: object): string {
	return JSON.stringify(options);
}

/**
 * Creates the small Island Host entry that imports application modules and
 * delegates lifecycle behavior to the typed browser bootstrap.
 */
function createEntrySource(options: CompiledIslandHydrationOptions): string {
	const hmrSource = options.hmrEnabled
		? `registerIslandHmr(configuration, (url) => import(url), ${JSON.stringify(options.importPath)});`
		: '';
	return `
import { hydrateRoot } from ${JSON.stringify(options.reactDomClientImportPath)};
import { createElement, useEffect } from ${JSON.stringify(options.reactImportPath)};
import * as ComponentModule from ${JSON.stringify(options.importPath)};
import { getIslandHydrationRuntime, mountIslands, registerIslandHmr } from ${JSON.stringify(ISLAND_BOOTSTRAP_ID)};

const configuration = {
  targetSelector: ${JSON.stringify(options.targetSelector)},
  componentModule: ComponentModule,
  componentRef: ${JSON.stringify(options.componentRef ?? '')},
  componentFile: ${JSON.stringify(options.componentFile ?? '')},
  scriptId: ${JSON.stringify(options.scriptId)},
  runtime: { hydrateRoot, createElement, useEffect },
  runtimeState: getIslandHydrationRuntime()
};
const mount = () => mountIslands(configuration);
${hmrSource}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
`;
}

/**
 * Creates the Page entry contract consumed by the browser lifecycle.
 *
 * @remarks
 * Router adapters provide their tree expression as an intentional integration
 * boundary. Everything else—module normalization, page-data reading, HMR, and
 * root ownership—belongs to the shared browser module.
 */
function createPageEntrySource(options: CompiledPageHydrationOptions): string {
	if (options.routerComponents && !options.routerImportPath) {
		throw new Error('routerImportPath is required when router components are configured');
	}
	if (options.routerComponents && !options.routerPropsExpression) {
		throw new Error('routerPropsExpression is required when router components are configured');
	}
	const pageImport =
		options.isMdx || options.hasPagePreload
			? `import * as PageModule from ${JSON.stringify(options.importPath)};`
			: `import Page from ${JSON.stringify(options.importPath)};`;
	const initialPage =
		options.isMdx || options.hasPagePreload
			? `const initialPage = resolvePageModule(PageModule, ${options.isMdx}, ${options.isMdx ? 'ensurePageConfigLayouts' : 'undefined'});`
			: `const initialPage = resolvePageModule({ default: Page }, false);`;
	const routerImports = options.routerComponents
		? `import { ${options.routerComponents.router}, ${options.routerComponents.pageContent} } from ${JSON.stringify(options.routerImportPath)};`
		: '';
	const routerTree = options.routerComponents
		? `const createTree = (Page, props) => {
  const pageContent = createElement(${options.routerComponents.pageContent});
  return createElement(${options.routerComponents.router}, ${options.routerPropsExpression}, pageContent);
};`
		: 'const createTree = (Page, props) => composeLayoutPageTree(Page, props);';
	const normalizationImport = options.isMdx
		? `import { ensurePageConfigLayouts } from ${JSON.stringify(options.pageLayoutNormalizationImportPath)};`
		: '';
	const hmr = options.hmrEnabled
		? `hmr: {
    importPath: ${JSON.stringify(options.importPath)},
    ${options.routerComponents ? 'getLayoutStack: (Page) => (Page.config?.layouts ?? []).map((layout) => layout?.config?.identity?.file ?? "").join("|")' : ''}
  },`
		: '';
	return `
import { hydrateRoot } from ${JSON.stringify(options.reactDomClientImportPath)};
import { createElement } from ${JSON.stringify(options.reactImportPath)};
import { resolvePageModule, startPageHydration } from ${JSON.stringify(PAGE_BOOTSTRAP_ID)};
import { readPageDataDocument, getPageDataFromDocument } from ${JSON.stringify(PAGE_DATA_READER_ID)};
${options.routerComponents ? '' : `import { composeLayoutPageTree } from ${JSON.stringify(options.layoutComposeImportPath)};`}
${routerImports}
${normalizationImport}
${pageImport}
const pageModuleUrl = ${options.pageModuleUrlExpression};
${initialPage}
${routerTree}
export default initialPage.Page;
${options.hasPagePreload ? 'export const preload = initialPage.preload;' : ''}
export const config = initialPage.Page.config;
startPageHydration({
  scriptId: ${JSON.stringify(options.scriptId)},
  pageModuleUrl,
  Page: initialPage.Page,
  pageDataReader: { readPageDataDocument, getPageDataFromDocument },
  runtime: { hydrateRoot, createElement },
  createTree,
  hasRouter: ${Boolean(options.routerComponents)},
  isMdx: ${options.isMdx},
  ${options.isMdx ? 'normalizePageConfig: ensurePageConfigLayouts,' : ''}
  ${options.hasPagePreload ? 'preload: initialPage.preload,' : ''}
  ${hmr}
});
`.trim();
}

/**
 * Resolves framework browser sources from repository TypeScript or published
 * JavaScript files while keeping application and vendor modules external.
 */
function createBootstrapPlugin(): Plugin {
	const sourcePaths = new Map([
		[ISLAND_BOOTSTRAP_ID, ['island-hydration.ts', 'island-hydration.js']],
		[PAGE_BOOTSTRAP_ID, ['page-hydration.ts', 'page-hydration.js']],
		[PAGE_DATA_READER_ID, ['../page-data-reader.ts', '../page-data-reader.js']],
	]);
	const readBootstrapSource = (id: string): string => {
		const candidates = sourcePaths.get(id);
		if (!candidates) throw new Error(`Unknown hydration bootstrap module: ${id}`);
		for (const relativePath of candidates) {
			try {
				return readFileSync(new URL(`./browser/${relativePath}`, import.meta.url), 'utf8');
			} catch {
				continue;
			}
		}
		throw new Error(`Unable to locate hydration bootstrap source for ${id}`);
	};
	return {
		name: 'ecopages-react-hydration-bootstrap',
		resolveId(source: string, importer?: string) {
			if (sourcePaths.has(source)) return source;
			if (importer === PAGE_DATA_READER_ID && source === './page-data-manifest.ts') {
				return PAGE_DATA_MANIFEST_ID;
			}
			return undefined;
		},
		load(id: string): LoadResult | undefined {
			if (id === PAGE_DATA_MANIFEST_ID) {
				return {
					code: readFileSync(new URL('./page-data-manifest.ts', import.meta.url), 'utf8'),
					moduleType: 'ts',
				};
			}
			if (!sourcePaths.has(id)) return undefined;
			return { code: readBootstrapSource(id), moduleType: 'ts' };
		},
	};
}

type CompileEntryOptions = {
	entryId: string;
	entrySource: string;
	external: string[];
	minify: boolean;
	errorMessage: string;
};

/** Bundles one virtual entry and closes the Rolldown bundle after generation. */
async function compileEntry(options: CompileEntryOptions): Promise<string> {
	const bundle = await rolldown({
		input: options.entryId,
		plugins: [
			{
				name: 'ecopages-react-entry',
				resolveId(source: string) {
					return source === options.entryId ? source : undefined;
				},
				load(id: string): LoadResult | undefined {
					return id === options.entryId ? { code: options.entrySource, moduleType: 'js' } : undefined;
				},
			},
			createBootstrapPlugin(),
		],
		external: options.external,
		transform: { target: 'es2021' },
	});
	try {
		const generated = await bundle.generate({ format: 'esm', minify: options.minify });
		const chunk = generated.output.find((output) => output.type === 'chunk');
		if (!chunk || !('code' in chunk)) throw new Error(options.errorMessage);
		return chunk.code ?? '';
	} finally {
		await bundle.close();
	}
}

/** Compiles an Island Host entry using the shared virtual-entry pipeline. */
function compileIsland(options: CompiledIslandHydrationOptions): Promise<string> {
	return compileEntry({
		entryId: 'virtual:ecopages-react-island-entry',
		entrySource: createEntrySource(options),
		external: [options.importPath, options.reactImportPath, options.reactDomClientImportPath],
		minify: options.minify,
		errorMessage: 'React hydration compiler emitted no JavaScript chunk',
	});
}

/** Compiles a Page entry using the shared virtual-entry pipeline. */
function compilePage(options: CompiledPageHydrationOptions): Promise<string> {
	return compileEntry({
		entryId: 'virtual:ecopages-react-page-entry',
		entrySource: createPageEntrySource(options),
		external: [
			options.importPath,
			options.reactImportPath,
			options.reactDomClientImportPath,
			options.routerImportPath,
			options.layoutComposeImportPath,
			options.pageLayoutNormalizationImportPath,
		].filter((value): value is string => Boolean(value)),
		minify: options.minify,
		errorMessage: 'React page hydration compiler emitted no JavaScript chunk',
	});
}

/** Caches in-flight and completed compilations while evicting rejected work. */
class CompilationCache {
	private readonly entries = new Map<string, Promise<string>>();

	/** Returns a cached compilation or starts exactly one compilation for the key. */
	getOrCompile(key: string, factory: () => Promise<string>): Promise<string> {
		const cached = this.entries.get(key);
		if (cached) return cached;
		const pending = factory();
		this.entries.set(key, pending);
		pending.then(
			() => undefined,
			() => {
				if (this.entries.get(key) === pending) this.entries.delete(key);
			},
		);
		return pending;
	}
}

/**
 * Compiles the editable React Island Host lifecycle into a browser ESM string.
 *
 * @remarks
 * Compilation is cached by the complete entry configuration. Rejected promises
 * are removed so a transient filesystem or bundler error can recover.
 */
export class IslandHydrationScriptCompiler {
	private readonly compilationCache = new CompilationCache();

	/**
	 * Compiles and caches one readable or minified Island Host entry.
	 *
	 * @param options - Complete entry imports, selector, identity, and output mode.
	 * @returns A browser ESM source string.
	 */
	compile(options: CompiledIslandHydrationOptions): Promise<string> {
		const key = getCacheKey(options);
		return this.compilationCache.getOrCompile(key, () => compileIsland(options));
	}
}

/**
 * Compiles editable Page lifecycle modules into browser ESM strings.
 *
 * @remarks
 * The cache belongs to the service instance, allowing development restarts to
 * discard framework-source changes without sharing stale output globally.
 */
export class PageHydrationScriptCompiler {
	private readonly compilationCache = new CompilationCache();

	/**
	 * Compiles and caches one readable or minified Page entry.
	 *
	 * @param options - Complete page imports, router contract, and output mode.
	 * @returns A browser ESM source string.
	 */
	compile(options: CompiledPageHydrationOptions): Promise<string> {
		const key = getCacheKey(options);
		return this.compilationCache.getOrCompile(key, () => compilePage(options));
	}
}
