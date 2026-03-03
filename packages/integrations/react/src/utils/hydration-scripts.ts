/**
 * Hydration script generators for React pages.
 * These functions create the client-side scripts that hydrate React components.
 * @module
 */

import type { ReactRouterAdapter } from '../router-adapter.ts';

/**
 * Options for generating a hydration script.
 */
export type HydrationScriptOptions = {
	/** The import path for the bundled page component */
	importPath: string;
	/** Direct import path for React runtime module */
	reactImportPath: string;
	/** Direct import path for react-dom/client runtime module */
	reactDomClientImportPath: string;
	/** Direct import path for router runtime module */
	routerImportPath?: string;
	/** Whether running in development mode with HMR support */
	isDevelopment: boolean;
	/** Whether the source file is an MDX file */
	isMdx: boolean;
	/** Optional router adapter for SPA navigation */
	router?: ReactRouterAdapter;
};

export type IslandHydrationScriptOptions = {
  /** Bundled browser module path for the island component. */
  importPath: string;
  /** Browser import path for React runtime. */
  reactImportPath: string;
  /** Browser import path for react-dom/client runtime. */
  reactDomClientImportPath: string;
  /** Selector that resolves to the SSR root element for this island instance. */
  targetSelector: string;
  /** Serialized component props emitted at render time. */
  props: Record<string, unknown>;
  /** Optional stable component id used to resolve named exports reliably. */
  componentRef?: string;
  /** Optional source file hint used as fallback for component resolution. */
  componentFile?: string;
  /** Enables development-oriented non-minified output. */
  isDevelopment: boolean;
};

/**
 * Generates the import statement for the page component.
 * MDX files use namespace imports to access the config export.
 */
function getImportStatement(importPath: string, isMdx: boolean): string {
	return isMdx
		? `import * as MDXModule from "${importPath}";\nconst Page = MDXModule.default;\nif (MDXModule.config) Page.config = MDXModule.config;`
		: `import Page from "${importPath}";`;
}

/**
 * Generates the HMR import statement for hot-reloading.
 * MDX files need to extract config from the new module.
 */
function getHmrImportStatement(isMdx: boolean): string {
	return isMdx
		? 'const NewPage = newModule.default; if (newModule.config) NewPage.config = newModule.config;'
		: 'const NewPage = newModule.default;';
}

/**
 * Returns the component type label for logging.
 */
function getComponentType(isMdx: boolean): string {
	return isMdx ? 'MDX' : 'React';
}

/**
 * Creates development hydration script with router support.
 * Includes HMR handlers for hot module replacement.
 * Layout is NOT applied here since PageContent handles it.
 */
function createDevScriptWithRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, router, reactImportPath, reactDomClientImportPath, routerImportPath } = options;
	const { components, getRouterProps } = router!;
	if (!routerImportPath) {
		throw new Error('routerImportPath is required when router adapter is configured');
	}

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
import { ${components.router}, ${components.pageContent} } from "${routerImportPath}";
${getImportStatement(importPath, isMdx)}

window.__ecopages_hmr_handlers__ = window.__ecopages_hmr_handlers__ || {};
window.__ecopages_router_active__ = false;
window.__ecopages_reload_current_page__ = null;
let root = null;

const getPageData = () => {
  const el = document.getElementById("__ECO_PAGE_DATA__");
  if (el?.textContent) {
    try { return JSON.parse(el.textContent); } catch {}
  }
  return {};
};

const props = getPageData();

window.__ECO_PAGE__ = {
  module: "${importPath}",
  props
};

const createTree = (Component, props) => {
  const pageContent = createElement(${components.pageContent});
  return createElement(${components.router}, ${getRouterProps('Component', 'props')}, pageContent);
};

const mount = () => {
  root = hydrateRoot(document, createTree(Page, props), {
    onRecoverableError: (err) => console.warn("[ecopages] Hydration error:", err)
  });
  window.__ecopages_router_active__ = true;
  window.__ecopages_hmr_handlers__["${importPath}"] = async (newUrl) => {
    if (window.__ecopages_router_active__ && window.__ecopages_reload_current_page__) {
      await window.__ecopages_reload_current_page__();
      console.log("[ecopages] ${getComponentType(isMdx)} component updated via router");
      return;
    }
    try {
      const newModule = await import(newUrl);
      ${getHmrImportStatement(isMdx)}
      root.render(createTree(NewPage, props));
      console.log("[ecopages] ${getComponentType(isMdx)} component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload ${getComponentType(isMdx)} component:", e);
    }
  };
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
`.trim();
}

/**
 * Creates development hydration script without router.
 * Includes HMR handlers for hot module replacement.
 */
function createDevScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath } = options;

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
${getImportStatement(importPath, isMdx)}

window.__ecopages_hmr_handlers__ = window.__ecopages_hmr_handlers__ || {};
let root = null;

const getPageData = () => {
  const el = document.getElementById("__ECO_PAGE_DATA__");
  if (el?.textContent) {
    try { return JSON.parse(el.textContent); } catch {}
  }
  return {};
};

const props = getPageData();

window.__ECO_PAGE__ = {
  module: "${importPath}",
  props
};

const createTree = (Component, props) => {
  const Layout = Component.config?.layout;
  const pageElement = createElement(Component, props);
  return Layout ? createElement(Layout, null, pageElement) : pageElement;
};

const mount = () => {
  root = hydrateRoot(document, createTree(Page, props), {
    onRecoverableError: (err) => console.warn("[ecopages] Hydration error:", err)
  });
  window.__ecopages_hmr_handlers__["${importPath}"] = async (newUrl) => {
    try {
      const newModule = await import(newUrl);
      ${getHmrImportStatement(isMdx)}
      root.render(createTree(NewPage, props));
      console.log("[ecopages] ${getComponentType(isMdx)} component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload ${getComponentType(isMdx)} component:", e);
    }
  };
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
`.trim();
}

/**
 * Creates minified production hydration script with router support.
 * Layout is NOT applied here since PageContent handles it.
 */
function createProdScriptWithRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, router, reactImportPath, reactDomClientImportPath, routerImportPath } = options;
	const { components, getRouterProps } = router!;
	if (!routerImportPath) {
		throw new Error('routerImportPath is required when router adapter is configured');
	}

	if (isMdx) {
		return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{${components.router} as R,${components.pageContent} as PC}from"${routerImportPath}";import*as M from"${importPath}";const P=M.default;if(M.config)P.config=M.config;const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
	}

	return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{${components.router} as R,${components.pageContent} as PC}from"${routerImportPath}";import P from"${importPath}";const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
}

/**
 * Creates minified production hydration script without router.
 */
function createProdScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath } = options;

	if (isMdx) {
		return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import*as M from"${importPath}";const P=M.default;if(M.config)P.config=M.config;const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);return L?ce(L,null,pe):pe};const m=()=>hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
	}

	return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import P from"${importPath}";const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);return L?ce(L,null,pe):pe};const m=()=>hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
}

/**
 * Creates a hydration script for client-side React hydration.
 * Generates appropriate script based on environment and router configuration.
 * @param options - Configuration options for script generation
 * @returns The generated hydration script as a string
 */
export function createHydrationScript(options: HydrationScriptOptions): string {
	const { isDevelopment, router } = options;

	if (isDevelopment) {
		return router ? createDevScriptWithRouter(options) : createDevScriptWithoutRouter(options);
	}

	return router ? createProdScriptWithRouter(options) : createProdScriptWithoutRouter(options);
}

/**
 * Creates the client bootstrap for component-level React islands.
 *
 * The island runtime intentionally uses `createRoot()` (not `hydrateRoot()`) and
 * mounts into the SSR element identified by `targetSelector`.
 *
 * Rationale:
 * - No synthetic wrapper element is introduced in SSR output.
 * - DOM structure remains identical to authored component markup.
 * - Runtime ownership is isolated per island instance.
 *
 * Generated script behavior:
 * - resolves the component export by metadata (`componentRef`, `componentFile`)
 *   before falling back to default/first function export
 * - selects island root using `targetSelector`
 * - creates a fresh React root and renders with serialized `props`
 *
 * @param options Island script generation options.
 * @returns Browser-executable JavaScript module source.
 */
export function createIslandHydrationScript(options: IslandHydrationScriptOptions): string {
  const targetSelector = JSON.stringify(options.targetSelector);
  const serializedProps = JSON.stringify(options.props ?? {});
  const componentRef = JSON.stringify(options.componentRef ?? '');
  const componentFile = JSON.stringify(options.componentFile ?? '');

  if (options.isDevelopment) {
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

const target = document.querySelector(${targetSelector});
const Component = resolveComponent();
if (target && Component) {
  const props = ${serializedProps};
  const root = createRoot(target);
  root.render(createElement(Component, props));
}
`.trim();
  }

  return `import{createRoot as cr}from"${options.reactDomClientImportPath}";import{createElement as ce}from"${options.reactImportPath}";import*as M from"${options.importPath}";const r=${componentRef};const f=${componentFile};const mv=Object.values(M);const c=mv.find((e)=>{if(typeof e!=="function")return false;const ec=e.config?.__eco;if(!ec)return false;if(r&&ec.id===r)return true;if(f&&ec.file===f)return true;return false;})??(typeof M.default==="function"?M.default:mv.find((e)=>typeof e==="function")??null);const t=document.querySelector(${targetSelector});if(t&&c){const p=${serializedProps};cr(t).render(ce(c,p))}`;
}
