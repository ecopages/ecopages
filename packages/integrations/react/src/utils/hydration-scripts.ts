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
 * Generates the development cleanup hook for the page-level React root.
 *
 * Why this exists:
 * browser-router and React-router hand document ownership back and forth. The
 * client runtime therefore needs a single cleanup entry point that can unmount
 * the active React root, clear ownership flags, and discard serialized page data
 * before a non-React renderer or a fresh React bootstrap takes over.
 *
 * Why it is emitted as a string:
 * this module generates browser bootstraps, so the cleanup behavior must be
 * embedded directly into the emitted module source.
 */
function getDevPageRootCleanupScript(): string {
	return `window.__ecopages_cleanup_page_root__ = () => {
  const activeRoot = window.__ecopages_page_root__ || root;
  if (!activeRoot) {
    window.__ecopages_page_root__ = null;
    window.__ecopages_navigation__?.setOwner("none");
    delete window.__ECO_PAGE__;
    return;
  }
  window.__ecopages_page_root__ = null;
  window.__ecopages_navigation__?.setOwner("none");
  delete window.__ECO_PAGE__;
  root = null;
  activeRoot.unmount();
};`;
}

/**
 * Minified production variant of the page-root cleanup hook.
 *
 * It mirrors the development behavior exactly so navigation ownership semantics
 * remain identical across environments while keeping the emitted payload small.
 */
function getProdPageRootCleanupScript(): string {
	return 'window.__ecopages_cleanup_page_root__=()=>{const a=window.__ecopages_page_root__||root;if(!a){window.__ecopages_page_root__=null;window.__ecopages_navigation__?.setOwner("none");delete window.__ECO_PAGE__;return}window.__ecopages_page_root__=null;window.__ecopages_navigation__?.setOwner("none");delete window.__ECO_PAGE__;root=null;a.unmount()};';
}

/**
 * Creates development hydration script with router support.
 *
 * Why this branch exists:
 * router-managed React pages keep a long-lived root across client-side
 * navigations. The bootstrap therefore hydrates once, reuses that root for
 * future renders, exposes cleanup for ownership handoff, and lets the router
 * adapter reconstruct page content instead of rebuilding layout trees here.
 *
 * How it works:
 * - imports the page module and router runtime pieces
 * - reads serialized page props from the server payload
 * - hydrates or re-renders the shared page root
 * - installs HMR handlers that either ask the router to reload the active page
 *   or patch the current root directly when the router is inactive
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
window.__ecopages_page_root__ = window.__ecopages_page_root__ || null;
let root = window.__ecopages_page_root__;
${getDevPageRootCleanupScript()}

const getPageData = () => {
  const el = document.getElementById("__ECO_PAGE_DATA__") || document.getElementById("__ECO_PAGE_DATA_FALLBACK__");
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
  if (window.__ecopages_page_root__) {
    root = window.__ecopages_page_root__;
    root.render(createTree(Page, props));
  } else {
    root = hydrateRoot(document, createTree(Page, props), {
      onRecoverableError: (err) => console.warn("[ecopages] Hydration error:", err)
    });
    window.__ecopages_page_root__ = root;
  }
  window.__ecopages_navigation__?.setOwner("react-router");
  window.__ecopages_hmr_handlers__["${importPath}"] = async (newUrl) => {
    if (window.__ecopages_navigation__?.getOwnerState().owner === "react-router") {
      await window.__ecopages_navigation__?.reloadCurrentPage?.({ clearCache: false, source: "react-router" });
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
 *
 * Why this branch exists:
 * non-router React pages rebuild their layout tree directly from the page
 * module on the client. That means the bootstrap must recreate the page and its
 * optional layout so hydration matches the server HTML exactly.
 *
 * How it works:
 * - imports the page module directly
 * - reconstructs the layout wrapper from `Page.config?.layout`
 * - hydrates a single document root
 * - patches that root during HMR without involving a router adapter
 */
function createDevScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath } = options;

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
${getImportStatement(importPath, isMdx)}

window.__ecopages_hmr_handlers__ = window.__ecopages_hmr_handlers__ || {};
window.__ecopages_page_root__ = window.__ecopages_page_root__ || null;
let root = window.__ecopages_page_root__;
${getDevPageRootCleanupScript()}

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
  const layoutProps = props?.locals ? { locals: props.locals } : null;
  return Layout ? createElement(Layout, layoutProps, pageElement) : pageElement;
};

const mount = () => {
  if (window.__ecopages_page_root__) {
    root = window.__ecopages_page_root__;
    root.render(createTree(Page, props));
  } else {
    root = hydrateRoot(document, createTree(Page, props), {
      onRecoverableError: (err) => console.warn("[ecopages] Hydration error:", err)
    });
    window.__ecopages_page_root__ = root;
  }
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
 *
 * This is the production counterpart to `createDevScriptWithRouter()`. The
 * ownership and hydration behavior is the same; only the emitted source is
 * compressed for delivery.
 */
function createProdScriptWithRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, router, reactImportPath, reactDomClientImportPath, routerImportPath } = options;
	const { components, getRouterProps } = router!;
	if (!routerImportPath) {
		throw new Error('routerImportPath is required when router adapter is configured');
	}

	if (isMdx) {
		return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{${components.router} as R,${components.pageContent} as PC}from"${routerImportPath}";import*as M from"${importPath}";const P=M.default;if(M.config)P.config=M.config;window.__ecopages_page_root__=window.__ecopages_page_root__||null;let root=window.__ecopages_page_root__;${getProdPageRootCleanupScript()}const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__")||document.getElementById("__ECO_PAGE_DATA_FALLBACK__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>{if(window.__ecopages_page_root__){root=window.__ecopages_page_root__;root.render(ct(P,pr));window.__ecopages_navigation__?.setOwner("react-router");return}root=hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ecopages_page_root__=root;window.__ecopages_navigation__?.setOwner("react-router")};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
	}

	return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{${components.router} as R,${components.pageContent} as PC}from"${routerImportPath}";import P from"${importPath}";window.__ecopages_page_root__=window.__ecopages_page_root__||null;let root=window.__ecopages_page_root__;${getProdPageRootCleanupScript()}const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__")||document.getElementById("__ECO_PAGE_DATA_FALLBACK__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>{if(window.__ecopages_page_root__){root=window.__ecopages_page_root__;root.render(ct(P,pr));window.__ecopages_navigation__?.setOwner("react-router");return}root=hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ecopages_page_root__=root;window.__ecopages_navigation__?.setOwner("react-router")};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
}

/**
 * Creates the minified production hydration script for non-router pages.
 *
 * In this mode the page module is responsible for reconstructing its own layout
 * tree. If the server serialized request `locals`, the script forwards those
 * values to the layout as well as the page so hydration matches the server HTML.
 * The runtime semantics mirror the development path; only the emitted source is
 * condensed.
 */
function createProdScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath } = options;

	if (isMdx) {
		return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import*as M from"${importPath}";const P=M.default;if(M.config)P.config=M.config;window.__ecopages_page_root__=window.__ecopages_page_root__||null;let root=window.__ecopages_page_root__;${getProdPageRootCleanupScript()}const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);const lp=p?.locals?{locals:p.locals}:null;return L?ce(L,lp,pe):pe};const m=()=>{if(window.__ecopages_page_root__){root=window.__ecopages_page_root__;root.render(ct(P,pr));return}root=hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ecopages_page_root__=root};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
	}

	return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import P from"${importPath}";window.__ecopages_page_root__=window.__ecopages_page_root__||null;let root=window.__ecopages_page_root__;${getProdPageRootCleanupScript()}const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);const lp=p?.locals?{locals:p.locals}:null;return L?ce(L,lp,pe):pe};const m=()=>{if(window.__ecopages_page_root__){root=window.__ecopages_page_root__;root.render(ct(P,pr));return}root=hr(document,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ecopages_page_root__=root};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
}

/**
 * Creates a hydration script for client-side React hydration.
 *
 * Why this dispatcher exists:
 * the runtime matrix is small but behaviorally different across development vs
 * production and router vs non-router pages. Keeping that branch here preserves
 * a compact public API while allowing each emitted script to stay focused.
 *
 * Selection rules:
 * - development uses readable scripts with HMR hooks
 * - production uses minified equivalents
 * - router presence decides whether page updates flow through the router runtime
 *   or rebuild directly from the page module
 *
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
 * - replaces the SSR host with a dedicated client-owned container
 * - creates a fresh React root and renders with serialized `props`
 *
 * Why it remounts instead of hydrating:
 * island SSR intentionally avoids synthetic wrapper elements. The runtime swaps
 * the authored SSR node for a dedicated client-owned container before mounting
 * so the server markup stays clean while the client still gets a stable root.
 *
 * @param options Island script generation options.
 * @returns Browser-executable JavaScript module source.
 */
export function createIslandHydrationScript(options: IslandHydrationScriptOptions): string {
	const targetSelector = JSON.stringify(options.targetSelector);
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

const mount = () => {
  const target = document.querySelector(${targetSelector});
  const Component = resolveComponent();
  if (!target || !Component) {
    return;
  }
  const props = JSON.parse(atob(target.getAttribute("data-eco-props") || "e30="));
  const container = document.createElement("eco-island");
  container.style.display = "block";
  target.replaceWith(container);
  const root = createRoot(container);
  root.render(createElement(Component, props));
};

document.addEventListener("eco:after-swap", mount);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
`.trim();
	}

	return `import{createRoot as cr}from"${options.reactDomClientImportPath}";import{createElement as ce}from"${options.reactImportPath}";import*as M from"${options.importPath}";const r=${componentRef};const f=${componentFile};const mv=Object.values(M);const c=mv.find((e)=>{if(typeof e!=="function")return false;const ec=e.config?.__eco;if(!ec)return false;if(r&&ec.id===r)return true;if(f&&ec.file===f)return true;return false;})??(typeof M.default==="function"?M.default:mv.find((e)=>typeof e==="function")??null);const m=()=>{const t=document.querySelector(${targetSelector});if(!t||!c)return;const p=JSON.parse(atob(t.getAttribute("data-eco-props")||"e30="));const ct=document.createElement("eco-island");ct.style.display="block";t.replaceWith(ct);cr(ct).render(ce(c,p))};document.addEventListener("eco:after-swap",m);document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m,{once:true}):m()`;
}
