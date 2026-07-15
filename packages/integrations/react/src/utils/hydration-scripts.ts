/**
 * Hydration script generators for React pages.
 * These functions create the page entry modules that hydrate React routes.
 * @module
 */

import type { ReactRouterAdapter } from '../router-adapter.ts';

const DEFAULT_LAYOUT_COMPOSE_IMPORT_PATH = '@ecopages/react/layout-compose';
const PAGE_LAYOUT_NORMALIZATION_IMPORT = '@ecopages/core/eco/page-layout-normalization';

function resolveLayoutComposeImportPath(options: HydrationScriptOptions): string {
	return options.layoutComposeImportPath ?? DEFAULT_LAYOUT_COMPOSE_IMPORT_PATH;
}

/**
 * Reads `__ECO_PAGE_DATA__`, supporting both v1 envelopes and legacy flat props.
 *
 * @remarks
 * Detection mirrors `isEcoPageDataManifestV1`: require `v === 1`,
 * `navigationOwner === "react-router"`, string `module`, and a non-array object
 * `props`. Near-miss envelopes with a `v` field fall closed to empty props.
 */
function getDevPageDataReaderScript(): string {
	return `const readPageDataDocument = () => {
  const el = document.getElementById("__ECO_PAGE_DATA__");
  if (el?.textContent) {
    try {
      const parsed = JSON.parse(el.textContent);
      if (
        parsed &&
        parsed.v === 1 &&
        parsed.navigationOwner === "react-router" &&
        typeof parsed.module === "string" &&
        parsed.props &&
        typeof parsed.props === "object" &&
        !Array.isArray(parsed.props)
      ) {
        return { module: parsed.module, props: parsed.props };
      }
      if (parsed && typeof parsed === "object" && typeof parsed.v === "number") {
        return { props: {} };
      }
      return { props: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {} };
    } catch {}
  }
  return { props: {} };
};
const getPageData = () => readPageDataDocument().props;`;
}

/**
 * Minified equivalent of {@link getDevPageDataReaderScript}.
 */
function getProdPageDataReaderScript(): string {
	return `const rd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{const p=JSON.parse(e.textContent);if(p&&p.v===1&&p.navigationOwner==="react-router"&&typeof p.module==="string"&&p.props&&typeof p.props==="object"&&!Array.isArray(p.props))return{module:p.module,props:p.props};if(p&&typeof p==="object"&&typeof p.v==="number")return{props:{}};return{props:p&&typeof p==="object"&&!Array.isArray(p)?p:{}}}catch{}}return{props:{}}};const gd=()=>rd().props;`;
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
	/** Whether running in development mode with HMR support */
	isDevelopment: boolean;
	/** Whether the source file is an MDX file */
	isMdx: boolean;
	/** Optional router adapter for SPA navigation */
	router?: ReactRouterAdapter;
	/** Import path for shared layout composition helper */
	layoutComposeImportPath?: string;
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
	/** Enables development-oriented non-minified output. */
	isDevelopment: boolean;
};

/**
 * Generates the import statement for the page component.
 * MDX files use namespace imports to access the config export.
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
 * Generates the HMR import statement for hot-reloading.
 * MDX files need to extract config from the new module.
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
 * Minified production variant of the page-root cleanup hook.
 *
 * It mirrors the development behavior exactly so navigation ownership semantics
 * remain identical across environments while keeping the emitted payload small.
 */
function getProdPageRootCleanupScript(): string {
	return 'window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.react=window.__ECO_PAGES__.react||{};window.__ECO_PAGES__.react.cleanupPageRoot=()=>{const a=window.__ECO_PAGES__.react?.pageRoot||root;if(!a){window.__ECO_PAGES__.react.pageRoot=null;window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router");delete window.__ECO_PAGES__.page;return}window.__ECO_PAGES__.react.pageRoot=null;window.__ECO_PAGES__?.navigation?.releaseOwnership?.("react-router");delete window.__ECO_PAGES__.page;root=null;a.unmount()};';
}

function getDevRouterBootstrapRegistrationScript(): string {
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

function getProdRouterBootstrapRegistrationScript(): string {
	return 'const o=window.__ECO_PAGES__?.navigation?.getOwnerState?.();if(!(o?.owner==="react-router"&&o.canHandleSpaNavigation)){window.__ECO_PAGES__?.navigation?.register({owner:"react-router",cleanupBeforeHandoff:async()=>{window.__ECO_PAGES__?.react?.cleanupPageRoot?.()}});window.__ECO_PAGES__?.navigation?.claimOwnership?.("react-router")}';
}

function getDevReuseExistingRouterRootScript(): string {
	return `const shouldReuseExistingRouterRoot = () => {
  const ownerState = window.__ECO_PAGES__?.navigation?.getOwnerState?.();
  return Boolean(
    window.__ECO_PAGES__.react?.pageRoot &&
      ownerState?.owner === "react-router" &&
      ownerState.canHandleSpaNavigation
  );
};`;
}

function getProdReuseExistingRouterRootScript(): string {
	return 'const sr=()=>{const o=window.__ECO_PAGES__?.navigation?.getOwnerState?.();return!!(window.__ECO_PAGES__.react?.pageRoot&&o?.owner==="react-router"&&o.canHandleSpaNavigation)};';
}

function getDevRerunRegistrationScript(scriptId: string): string {
	return `window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
window.__ECO_PAGES__.rerunScripts = window.__ECO_PAGES__.rerunScripts || {};
window.__ECO_PAGES__.rerunScripts[${JSON.stringify(scriptId)}] = mount;`;
}

function getProdRerunRegistrationScript(scriptId: string): string {
	return `window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.rerunScripts=window.__ECO_PAGES__.rerunScripts||{};window.__ECO_PAGES__.rerunScripts[${JSON.stringify(scriptId)}]=m;`;
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
	const { importPath, isMdx, router, reactImportPath, reactDomClientImportPath, routerImportPath, scriptId } =
		options;
	const pageModuleUrlExpression = options.pageModuleUrlExpression ?? 'import.meta.url';
	const { components, getRouterProps } = router!;
	if (!routerImportPath) {
		throw new Error('routerImportPath is required when router adapter is configured');
	}

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
import { ${components.router}, ${components.pageContent} } from "${routerImportPath}";
${getImportStatement(importPath, isMdx)}
const pageModuleUrl = ${pageModuleUrlExpression};
export default Page;
export const config = Page.config;
const isActivePageEntry = Boolean(document.querySelector('script[data-eco-script-id="${scriptId}"]'));

if (isActivePageEntry) {

window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
window.__ECO_PAGES__.hmrHandlers = window.__ECO_PAGES__.hmrHandlers || {};
window.__ECO_PAGES__.react = window.__ECO_PAGES__.react || {};
window.__ECO_PAGES__.react.pageRoot = window.__ECO_PAGES__.react.pageRoot || null;
let root = window.__ECO_PAGES__.react.pageRoot;
${getDevPageRootCleanupScript()}
${getDevRouterBootstrapRegistrationScript()}
${getDevReuseExistingRouterRootScript()}

${getDevPageDataReaderScript()}

const initialPageData = readPageDataDocument();
const props = initialPageData.props;

window.__ECO_PAGES__.page = {
  module: initialPageData.module || pageModuleUrl,
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
    module: pageData.module || pageModuleUrl,
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
  window.__ECO_PAGES__.hmrHandlers["${importPath}"] = async (newUrl) => {
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
          moduleUrl: "${importPath}",
          source: "react-router"
        });
        console.log("[ecopages] ${getComponentType(isMdx)} component updated via router");
        return;
      }

      const nextPageData = readPageDataDocument();
      window.__ECO_PAGES__.page = {
        module: nextPageData.module || pageModuleUrl,
        props: nextProps
      };
      root.render(createTree(NewPage, nextProps));
      console.log("[ecopages] ${getComponentType(isMdx)} component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload ${getComponentType(isMdx)} component:", e);
    }
  };
};

${getDevRerunRegistrationScript(scriptId)}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
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
 * - reconstructs the layout wrapper from `Page.config?.layouts`
 * - hydrates a single document root
 * - patches that root during HMR without involving a router adapter
 */
function createDevScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath, scriptId } = options;
	const pageModuleUrlExpression = options.pageModuleUrlExpression ?? 'import.meta.url';
	const layoutComposeImportPath = resolveLayoutComposeImportPath(options);

	return `
import { hydrateRoot } from "${reactDomClientImportPath}";
import { createElement } from "${reactImportPath}";
import { composeLayoutPageTree } from "${layoutComposeImportPath}";
${getImportStatement(importPath, isMdx)}
const pageModuleUrl = ${pageModuleUrlExpression};
export default Page;
export const config = Page.config;
const isActivePageEntry = Boolean(document.querySelector('script[data-eco-script-id="${scriptId}"]'));

if (isActivePageEntry) {

window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
window.__ECO_PAGES__.hmrHandlers = window.__ECO_PAGES__.hmrHandlers || {};
window.__ECO_PAGES__.react = window.__ECO_PAGES__.react || {};
window.__ECO_PAGES__.react.pageRoot = window.__ECO_PAGES__.react.pageRoot || null;
let root = window.__ECO_PAGES__.react.pageRoot;
${getDevPageRootCleanupScript()}

${getDevPageDataReaderScript()}

const initialPageData = readPageDataDocument();
const props = initialPageData.props;

window.__ECO_PAGES__.page = {
  module: initialPageData.module || pageModuleUrl,
  props
};

const createTree = (Component, props) => composeLayoutPageTree(Component, props);

const mount = () => {
  const pageData = readPageDataDocument();
  const props = pageData.props;
  window.__ECO_PAGES__.page = {
    module: pageData.module || pageModuleUrl,
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
  window.__ECO_PAGES__.hmrHandlers["${importPath}"] = async (newUrl) => {
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

${getDevRerunRegistrationScript(scriptId)}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
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
	const { importPath, isMdx, router, reactImportPath, reactDomClientImportPath, routerImportPath, scriptId } =
		options;
	const pageModuleUrlExpression = options.pageModuleUrlExpression ?? 'import.meta.url';
	const { components, getRouterProps } = router!;
	if (!routerImportPath) {
		throw new Error('routerImportPath is required when router adapter is configured');
	}

	if (isMdx) {
		return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{${components.router} as R,${components.pageContent} as PC}from"${routerImportPath}";import{ensurePageConfigLayouts as epl}from"${PAGE_LAYOUT_NORMALIZATION_IMPORT}";import*as M from"${importPath}";const P=M.default;if(M.config){P.config=M.config;epl(P.config);}const u=${pageModuleUrlExpression};export default P;export const config=P.config;const a=!!document.querySelector('script[data-eco-script-id="${scriptId}"]');if(a){window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.react=window.__ECO_PAGES__.react||{};window.__ECO_PAGES__.react.pageRoot=window.__ECO_PAGES__.react.pageRoot||null;let root=window.__ECO_PAGES__.react.pageRoot;${getProdPageRootCleanupScript()}${getProdRouterBootstrapRegistrationScript()}${getProdReuseExistingRouterRootScript()}${getProdPageDataReaderScript()}const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>{const pd=rd();const pr=pd.props;window.__ECO_PAGES__.page={module:pd.module||u,props:pr};if(sr()){root=window.__ECO_PAGES__.react.pageRoot;return}if(window.__ECO_PAGES__.react?.pageRoot){root=window.__ECO_PAGES__.react.pageRoot;return}root=hr(document.body,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ECO_PAGES__.react.pageRoot=root};${getProdRerunRegistrationScript(scriptId)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()}`;
	}

	return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{${components.router} as R,${components.pageContent} as PC}from"${routerImportPath}";import P from"${importPath}";const u=${pageModuleUrlExpression};export default P;export const config=P.config;const a=!!document.querySelector('script[data-eco-script-id="${scriptId}"]');if(a){window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.react=window.__ECO_PAGES__.react||{};window.__ECO_PAGES__.react.pageRoot=window.__ECO_PAGES__.react.pageRoot||null;let root=window.__ECO_PAGES__.react.pageRoot;${getProdPageRootCleanupScript()}${getProdRouterBootstrapRegistrationScript()}${getProdReuseExistingRouterRootScript()}${getProdPageDataReaderScript()}const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>{const pd=rd();const pr=pd.props;window.__ECO_PAGES__.page={module:pd.module||u,props:pr};if(sr()){root=window.__ECO_PAGES__.react.pageRoot;return}if(window.__ECO_PAGES__.react?.pageRoot){root=window.__ECO_PAGES__.react.pageRoot;return}root=hr(document.body,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ECO_PAGES__.react.pageRoot=root};${getProdRerunRegistrationScript(scriptId)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()}`;
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
	const { importPath, isMdx, reactImportPath, reactDomClientImportPath, scriptId } = options;
	const pageModuleUrlExpression = options.pageModuleUrlExpression ?? 'import.meta.url';
	const layoutComposeImportPath = resolveLayoutComposeImportPath(options);

	if (isMdx) {
		return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{composeLayoutPageTree as clp}from"${layoutComposeImportPath}";import{ensurePageConfigLayouts as epl}from"${PAGE_LAYOUT_NORMALIZATION_IMPORT}";import*as M from"${importPath}";const P=M.default;if(M.config){P.config=M.config;epl(P.config);}const u=${pageModuleUrlExpression};export default P;export const config=P.config;const a=!!document.querySelector('script[data-eco-script-id="${scriptId}"]');if(a){window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.react=window.__ECO_PAGES__.react||{};window.__ECO_PAGES__.react.pageRoot=window.__ECO_PAGES__.react.pageRoot||null;let root=window.__ECO_PAGES__.react.pageRoot;${getProdPageRootCleanupScript()}${getProdPageDataReaderScript()}const ct=(C,p)=>clp(C,p);const m=()=>{const pd=rd();const pr=pd.props;window.__ECO_PAGES__.page={module:pd.module||u,props:pr};if(window.__ECO_PAGES__.react?.pageRoot){root=window.__ECO_PAGES__.react.pageRoot;root.render(ct(P,pr));return}root=hr(document.body,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ECO_PAGES__.react.pageRoot=root};${getProdRerunRegistrationScript(scriptId)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()}`;
	}

	return `import{hydrateRoot as hr}from"${reactDomClientImportPath}";import{createElement as ce}from"${reactImportPath}";import{composeLayoutPageTree as clp}from"${layoutComposeImportPath}";import P from"${importPath}";const u=${pageModuleUrlExpression};export default P;export const config=P.config;const a=!!document.querySelector('script[data-eco-script-id="${scriptId}"]');if(a){window.__ECO_PAGES__=window.__ECO_PAGES__||{};window.__ECO_PAGES__.react=window.__ECO_PAGES__.react||{};window.__ECO_PAGES__.react.pageRoot=window.__ECO_PAGES__.react.pageRoot||null;let root=window.__ECO_PAGES__.react.pageRoot;${getProdPageRootCleanupScript()}${getProdPageDataReaderScript()}const ct=(C,p)=>clp(C,p);const m=()=>{const pd=rd();const pr=pd.props;window.__ECO_PAGES__.page={module:pd.module||u,props:pr};if(window.__ECO_PAGES__.react?.pageRoot){root=window.__ECO_PAGES__.react.pageRoot;root.render(ct(P,pr));return}root=hr(document.body,ct(P,pr),{onRecoverableError:(e)=>console.warn("[ecopages] Hydration error:",e)});window.__ECO_PAGES__.react.pageRoot=root};${getProdRerunRegistrationScript(scriptId)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()}`;
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
	const scriptId = options.scriptId;

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

${getDevRerunRegistrationScript(scriptId)}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
`.trim();
	}

	return `import{createRoot as cr}from"${options.reactDomClientImportPath}";import{createElement as ce}from"${options.reactImportPath}";import*as M from"${options.importPath}";const r=${componentRef};const f=${componentFile};const mv=Object.values(M);const c=mv.find((e)=>{if(typeof e!=="function")return false;const ec=e.config?.__eco;if(!ec)return false;if(r&&ec.id===r)return true;if(f&&ec.file===f)return true;return false;})??(typeof M.default==="function"?M.default:mv.find((e)=>typeof e==="function")??null);const m=()=>{const ts=document.querySelectorAll(${targetSelector});if(!c||ts.length===0)return;ts.forEach((t)=>{if(!(t instanceof HTMLElement))return;const p=JSON.parse(atob(t.getAttribute("data-eco-props")||"e30="));const ct=document.createElement("eco-island");ct.style.display="block";t.replaceWith(ct);cr(ct).render(ce(c,p))})};${getProdRerunRegistrationScript(scriptId)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m,{once:true}):m()`;
}
