/**
 * Hydration script generators for React pages.
 * These functions create the page entry modules that hydrate React routes.
 * @module
 */

import type { ReactRouterAdapter } from '../router-adapter.ts';
import { getDevPageDataReaderBootstrapSource } from '../page-data-reader.ts';

const DEFAULT_LAYOUT_COMPOSE_IMPORT_PATH = '@ecopages/react/layout-compose';
const PAGE_LAYOUT_NORMALIZATION_IMPORT = '@ecopages/core/eco/page-layout-normalization';

function getPageDataReaderSource(options: HydrationScriptOptions): string {
	if (options.pageDataReaderImportPath) {
		return `import { readPageDataDocument, getPageDataFromDocument as getPageData } from "${options.pageDataReaderImportPath}";`;
	}
	return getDevPageDataReaderBootstrapSource();
}

function resolveLayoutComposeImportPath(options: HydrationScriptOptions): string {
	return options.layoutComposeImportPath ?? DEFAULT_LAYOUT_COMPOSE_IMPORT_PATH;
}

/**
 * Options for generating a hydration script.
 */
export type HydrationScriptOptions = {
	/** The module path imported by the page entry module. */
	importPath: string;
	/** Browser expression that resolves to the page module URL the router should import. */
	pageModuleUrlExpression?: string;
	/** Stable id of the page entry script tag in the document. */
	scriptId: string;
	/** Direct import path for React runtime module */
	reactImportPath: string;
	/** Direct import path for react-dom/client runtime module */
	reactDomClientImportPath: string;
	/** Direct import path for router runtime module */
	routerImportPath?: string;
	/**
	 * When true, emit HMR registration and hot-reload handlers.
	 *
	 * @remarks
	 * The asset layer uses the same flag to leave HMR entries unbundled. When
	 * false, this generator emits the same readable bootstrap without HMR hooks.
	 */
	hmrEnabled: boolean;
	/** Whether the source file is an MDX file */
	isMdx: boolean;
	/** Optional router adapter for SPA navigation */
	router?: ReactRouterAdapter;
	/** Import path for shared layout composition helper */
	layoutComposeImportPath?: string;
	/**
	 * Optional import path for the page-data reader.
	 *
	 * @remarks
	 * When omitted, hydration scripts inline the reader so native browser ESM /
	 * HMR entry evaluation does not depend on bare `@ecopages/react/*` imports.
	 * Browser unit tests that execute `data:` scripts may still pass a resolvable URL.
	 */
	pageDataReaderImportPath?: string;
};

export type IslandHydrationScriptOptions = {
	/** Bundled browser module path for the island component. */
	importPath: string;
	/** Stable id of the island bootstrap script tag in the document. */
	scriptId: string;
	/** Browser import path for React runtime. */
	reactImportPath: string;
	/** Browser import path for react-dom/client runtime. */
	reactDomClientImportPath: string;
	/** Selector that resolves to all SSR root elements for this island component. */
	targetSelector: string;
	/** Optional stable component id used to resolve named exports reliably. */
	componentRef?: string;
	/** Optional source file hint used as fallback for component resolution. */
	componentFile?: string;
	/**
	 * When true, emit a compact source string.
	 *
	 * @remarks
	 * Island bootstraps use `bundle: false`, so compact output must be generated
	 * here rather than delegated to the bundler.
	 */
	minify: boolean;
};

/**
 * Generates the page component import for the hydration entry.
 *
 * @remarks
 * MDX pages need a namespace import so `config` can be copied onto the default
 * export before layout normalization runs.
 */
function getImportStatement(importPath: string, isMdx: boolean): string {
	return isMdx
		? `import * as MDXModule from "${importPath}";
import { ensurePageConfigLayouts } from "${PAGE_LAYOUT_NORMALIZATION_IMPORT}";
const Page = MDXModule.default;
if (MDXModule.config) {
  Page.config = MDXModule.config;
  ensurePageConfigLayouts(Page.config);
}`
		: `import Page from "${importPath}";`;
}

/**
 * Assigns `NewPage` from a hot-reloaded module, including MDX `config` reattach.
 */
function getHmrImportStatement(isMdx: boolean): string {
	return isMdx
		? `const NewPage = newModule.default;
if (newModule.config) {
  NewPage.config = newModule.config;
  ensurePageConfigLayouts(NewPage.config);
}`
		: 'const NewPage = newModule.default;';
}

function getComponentType(isMdx: boolean): string {
	return isMdx ? 'MDX' : 'React';
}

/**
 * Browser hook that unmounts the page React root and releases navigation ownership.
 *
 * @remarks
 * Emitted into the page bootstrap so browser-router / react-router handoff can
 * tear down React without knowing React root internals.
 */
function getPageRootCleanupScript(): string {
	return `window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
window.__ECO_PAGES__.react = window.__ECO_PAGES__.react || {};
window.__ECO_PAGES__.react.cleanupPageRoot = () => {
  const activeRoot = window.__ECO_PAGES__.react?.pageRoot || root;
  if (!activeRoot) {
    window.__ECO_PAGES__.react.pageRoot = null;
    window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router");
    delete window.__ECO_PAGES__.page;
    return;
  }
  window.__ECO_PAGES__.react.pageRoot = null;
  window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router");
  delete window.__ECO_PAGES__.page;
  root = null;
  activeRoot.unmount();
};`;
}

/**
 * Registers react-router with the shared navigation coordinator when it does
 * not already own SPA navigation.
 */
function getRouterBootstrapRegistrationScript(): string {
	return `const currentOwnerState = window.__ECO_PAGES__?.navigation?.getOwnerState?.();
if (!(currentOwnerState?.owner === "react-router" && currentOwnerState.canHandleSpaNavigation)) {
window.__ECO_PAGES__?.navigation?.register({
  owner: "react-router",
  cleanupBeforeHandoff: async () => {
    window.__ECO_PAGES__?.react?.cleanupPageRoot?.();
  }
});
window.__ECO_PAGES__?.navigation?.claimOwnership?.("react-router");
}`;
}

/**
 * Predicate used by router bootstraps to keep a long-lived hydrateRoot across
 * client navigations when react-router already owns the document.
 */
function getReuseExistingRouterRootScript(): string {
	return `const shouldReuseExistingRouterRoot = () => {
  const ownerState = window.__ECO_PAGES__?.navigation?.getOwnerState?.();
  return Boolean(
    window.__ECO_PAGES__.react?.pageRoot &&
      ownerState?.owner === "react-router" &&
      ownerState.canHandleSpaNavigation
  );
};`;
}

/**
 * Registers `mount` under `window.__ECO_PAGES__.rerunScripts` for after-swap re-execution.
 */
function getRerunRegistrationScript(scriptId: string): string {
	return `window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
window.__ECO_PAGES__.rerunScripts = window.__ECO_PAGES__.rerunScripts || {};
window.__ECO_PAGES__.rerunScripts[${JSON.stringify(scriptId)}] = mount;`;
}

/**
 * HMR handler for router pages: prefers coordinator reload when layouts change,
 * otherwise re-renders the existing root.
 */
function getRouterHmrHandlerScript(options: {
	importPath: string;
	isMdx: boolean;
}): string {
	const { importPath, isMdx } = options;
	return `  window.__ECO_PAGES__.hmrHandlers["${importPath}"] = async (newUrl) => {
    try {
      const newModule = await import(newUrl);
      const nextProps = getPageData();
      ${getHmrImportStatement(isMdx)}
      const currentPageLayoutStack = (Component) =>
        (Component.config?.layouts ?? []).map((layout) => layout?.config?.__eco?.file ?? '').join('|');
      const currentPageLayoutStackKey = currentPageLayoutStack(Page);
      const nextPageLayoutStackKey = currentPageLayoutStack(NewPage);

      if (window.__ECO_PAGES__?.navigation?.getOwnerState().owner === "react-router") {
        await window.__ECO_PAGES__?.navigation?.reloadCurrentPage?.({
          clearCache: currentPageLayoutStackKey !== nextPageLayoutStackKey,
          moduleUrl: newUrl,
          source: "react-router"
        });
        console.log("[ecopages] ${getComponentType(isMdx)} component updated via router");
        return;
      }

      const nextPageData = readPageDataDocument();
      window.__ECO_PAGES__.page = {
        module: nextPageData.moduleUrl || pageModuleUrl,
        props: nextProps
      };
      root.render(createTree(NewPage, nextProps));
      console.log("[ecopages] ${getComponentType(isMdx)} component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload ${getComponentType(isMdx)} component:", e);
    }
  };`;
}

/**
 * HMR handler for non-router pages: hot-imports the module and re-renders the layout tree.
 */
function getNonRouterHmrHandlerScript(options: { importPath: string; isMdx: boolean }): string {
	const { importPath, isMdx } = options;
	return `  window.__ECO_PAGES__.hmrHandlers["${importPath}"] = async (newUrl) => {
    try {
      const newModule = await import(newUrl);
      ${getHmrImportStatement(isMdx)}
      root.render(createTree(NewPage, props));
      console.log("[ecopages] ${getComponentType(isMdx)} component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload ${getComponentType(isMdx)} component:", e);
    }
  };`;
}

/**
 * Creates a readable hydration script with router support.
 *
 * @remarks
 * Router-managed pages keep a long-lived root across client navigations.
 * When `hmrEnabled` is true, HMR handlers are included. Otherwise the same
 * semantic source is emitted without HMR hooks; the asset layer bundles it and
 * production builds minify it.
 */
function createScriptWithRouter(options: HydrationScriptOptions): string {
	const {
		importPath,
		isMdx,
		router,
		reactImportPath,
		reactDomClientImportPath,
		routerImportPath,
		scriptId,
		hmrEnabled,
	} = options;
	const pageModuleUrlExpression = options.pageModuleUrlExpression ?? 'import.meta.url';
	const { components, getRouterProps } = router!;
	if (!routerImportPath) {
		throw new Error('routerImportPath is required when router adapter is configured');
	}

	const hmrInit = hmrEnabled
		? `window.__ECO_PAGES__.hmrHandlers = window.__ECO_PAGES__.hmrHandlers || {};
`
		: '';
	const hmrHandler = hmrEnabled ? getRouterHmrHandlerScript({ importPath, isMdx }) : '';

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
import { ${components.router}, ${components.pageContent} } from "${routerImportPath}";
${getPageDataReaderSource(options)}
${getImportStatement(importPath, isMdx)}
const pageModuleUrl = ${pageModuleUrlExpression};
export default Page;
export const config = Page.config;
const isActivePageEntry = Boolean(document.querySelector('script[data-eco-script-id="${scriptId}"]'));

if (isActivePageEntry) {

window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
${hmrInit}window.__ECO_PAGES__.react = window.__ECO_PAGES__.react || {};
window.__ECO_PAGES__.react.pageRoot = window.__ECO_PAGES__.react.pageRoot || null;
let root = window.__ECO_PAGES__.react.pageRoot;
${getPageRootCleanupScript()}
${getRouterBootstrapRegistrationScript()}
${getReuseExistingRouterRootScript()}

const initialPageData = readPageDataDocument();
const props = initialPageData.props;

window.__ECO_PAGES__.page = {
  module: initialPageData.moduleUrl || pageModuleUrl,
  props
};

const createTree = (Component, props) => {
  const pageContent = createElement(${components.pageContent});
  return createElement(${components.router}, ${getRouterProps('Component', 'props')}, pageContent);
};

const mount = () => {
  const pageData = readPageDataDocument();
  const props = pageData.props;
  window.__ECO_PAGES__.page = {
    module: pageData.moduleUrl || pageModuleUrl,
    props
  };

  if (shouldReuseExistingRouterRoot()) {
    root = window.__ECO_PAGES__.react.pageRoot;
    return;
  }

  if (window.__ECO_PAGES__.react?.pageRoot) {
    root = window.__ECO_PAGES__.react.pageRoot;
    return;
  }

  root = hydrateRoot(document.body, createTree(Page, props), {
    onRecoverableError: (err) => console.warn("[ecopages] Hydration error:", err)
  });
  window.__ECO_PAGES__.react.pageRoot = root;
${hmrHandler}
};

${getRerunRegistrationScript(scriptId)}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
}
`.trim();
}

/**
 * Creates a readable hydration script without router.
 *
 * @remarks
 * Reconstructs the page and layout tree via `composeLayoutPageTree` so hydration
 * matches SSR. HMR handlers are included only when `hmrEnabled` is true.
 */
function createScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath, scriptId, hmrEnabled } = options;
	const pageModuleUrlExpression = options.pageModuleUrlExpression ?? 'import.meta.url';
	const layoutComposeImportPath = resolveLayoutComposeImportPath(options);

	const hmrInit = hmrEnabled
		? `window.__ECO_PAGES__.hmrHandlers = window.__ECO_PAGES__.hmrHandlers || {};
`
		: '';
	const hmrHandler = hmrEnabled ? getNonRouterHmrHandlerScript({ importPath, isMdx }) : '';

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
import { composeLayoutPageTree } from "${layoutComposeImportPath}";
${getPageDataReaderSource(options)}
${getImportStatement(importPath, isMdx)}
const pageModuleUrl = ${pageModuleUrlExpression};
export default Page;
export const config = Page.config;
const isActivePageEntry = Boolean(document.querySelector('script[data-eco-script-id="${scriptId}"]'));

if (isActivePageEntry) {

window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
${hmrInit}window.__ECO_PAGES__.react = window.__ECO_PAGES__.react || {};
window.__ECO_PAGES__.react.pageRoot = window.__ECO_PAGES__.react.pageRoot || null;
let root = window.__ECO_PAGES__.react.pageRoot;
${getPageRootCleanupScript()}

const initialPageData = readPageDataDocument();
const props = initialPageData.props;

window.__ECO_PAGES__.page = {
  module: initialPageData.moduleUrl || pageModuleUrl,
  props
};

const createTree = (Component, props) => composeLayoutPageTree(Component, props);

const mount = () => {
  const pageData = readPageDataDocument();
  const props = pageData.props;
  window.__ECO_PAGES__.page = {
    module: pageData.moduleUrl || pageModuleUrl,
    props
  };

  if (window.__ECO_PAGES__.react?.pageRoot) {
    root = window.__ECO_PAGES__.react.pageRoot;
    root.render(createTree(Page, props));
  } else {
    root = hydrateRoot(document.body, createTree(Page, props), {
      onRecoverableError: (err) => console.warn("[ecopages] Hydration error:", err)
    });
    window.__ECO_PAGES__.react.pageRoot = root;
  }
${hmrHandler}
};

${getRerunRegistrationScript(scriptId)}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
}
`.trim();
}

/**
 * Creates a page hydration entry module.
 *
 * @remarks
 * Always emits readable source. Production page assets set `bundle: true` so
 * core's content-script processor minifies the result. Do not hand-minify here.
 */
export function createHydrationScript(options: HydrationScriptOptions): string {
	return options.router ? createScriptWithRouter(options) : createScriptWithoutRouter(options);
}

/**
 * Creates the client bootstrap for component-level React islands.
 *
 * @remarks
 * Island scripts use `bundle: false`, so compact output still needs a
 * handwritten string.
 */
export function createIslandHydrationScript(options: IslandHydrationScriptOptions): string {
	const targetSelector = JSON.stringify(options.targetSelector);
	const componentRef = JSON.stringify(options.componentRef ?? '');
	const componentFile = JSON.stringify(options.componentFile ?? '');
	const scriptId = options.scriptId;

	if (options.minify) {
		return `import{createRoot as cr}from"${options.reactDomClientImportPath}";import{createElement as ce}from"${options.reactImportPath}";import*as M from"${options.importPath}";const r=${componentRef};const f=${componentFile};const mv=Object.values(M);const c=mv.find((e)=>{if(typeof e!=="function")return false;const ec=e.config?.__eco;if(!ec)return false;if(r&&ec.id===r)return true;if(f&&ec.file===f)return true;return false;})??(typeof M.default==="function"?M.default:mv.find((e)=>typeof e==="function")??null);const m=()=>{const ts=document.querySelectorAll(${targetSelector});if(!c||ts.length===0)return;ts.forEach((t)=>{if(!(t instanceof HTMLElement))return;const p=JSON.parse(atob(t.getAttribute("data-eco-props")||"e30="));const ct=document.createElement("eco-island");ct.style.display="block";t.replaceWith(ct);cr(ct).render(ce(c,p))})};window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.rerunScripts=window.__ECO_PAGES__.rerunScripts||{};window.__ECO_PAGES__.rerunScripts[${JSON.stringify(scriptId)}]=m;document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m,{once:true}):m()`;
	}

	return `
import { createRoot } from "${options.reactDomClientImportPath}";
import { createElement } from "${options.reactImportPath}";
import * as ComponentModule from "${options.importPath}";

const resolveComponent = () => {
  const id = ${componentRef};
  const file = ${componentFile};
  const moduleValues = Object.values(ComponentModule);

  const matchByMetadata = moduleValues.find((entry) => {
    if (typeof entry !== "function") return false;
    const config = entry.config;
    const eco = config?.__eco;
    if (!eco) return false;
    if (id && eco.id === id) return true;
    if (file && eco.file === file) return true;
    return false;
  });

  if (matchByMetadata && typeof matchByMetadata === "function") {
    return matchByMetadata;
  }

  const defaultExport = ComponentModule.default;
  if (typeof defaultExport === "function") {
    return defaultExport;
  }

  const firstFunction = moduleValues.find((entry) => typeof entry === "function");
  return typeof firstFunction === "function" ? firstFunction : null;
};

const mount = () => {
  const targets = document.querySelectorAll(${targetSelector});
  const Component = resolveComponent();
  if (!Component || targets.length === 0) {
    return;
  }
  targets.forEach((target) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const props = JSON.parse(atob(target.getAttribute("data-eco-props") || "e30="));
    const container = document.createElement("eco-island");
    container.style.display = "block";
    target.replaceWith(container);
    const root = createRoot(container);
    root.render(createElement(Component, props));
  });
};

${getRerunRegistrationScript(scriptId)}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
`.trim();
}
