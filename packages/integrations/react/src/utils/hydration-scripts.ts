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
	/** Whether running in development mode with HMR support */
	isDevelopment: boolean;
	/** Whether the source file is an MDX file */
	isMdx: boolean;
	/** Optional router adapter for SPA navigation */
	router?: ReactRouterAdapter;
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
	const { importPath, isMdx, router } = options;
	const { importMapKey, components, getRouterProps } = router!;

	return `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";
import { ${components.router}, ${components.pageContent} } from "${importMapKey}";
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
  root = hydrateRoot(document, createTree(Page, props));
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
	const { importPath, isMdx } = options;

	return `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";
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
  root = hydrateRoot(document, createTree(Page, props));
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
	const { importPath, isMdx, router } = options;
	const { importMapKey, components, getRouterProps } = router!;

	if (isMdx) {
		return `import{hydrateRoot as hr}from"react-dom/client";import{createElement as ce}from"react";import{${components.router} as R,${components.pageContent} as PC}from"${importMapKey}";import*as M from"${importPath}";const P=M.default;if(M.config)P.config=M.config;const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>hr(document,ct(P,pr));document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
	}

	return `import{hydrateRoot as hr}from"react-dom/client";import{createElement as ce}from"react";import{${components.router} as R,${components.pageContent} as PC}from"${importMapKey}";import P from"${importPath}";const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>ce(R,${getRouterProps('C', 'p')},ce(PC));const m=()=>hr(document,ct(P,pr));document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
}

/**
 * Creates minified production hydration script without router.
 */
function createProdScriptWithoutRouter(options: HydrationScriptOptions): string {
	const { importPath, isMdx } = options;

	if (isMdx) {
		return `import{hydrateRoot as hr}from"react-dom/client";import{createElement as ce}from"react";import*as M from"${importPath}";const P=M.default;if(M.config)P.config=M.config;const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);return L?ce(L,null,pe):pe};const m=()=>hr(document,ct(P,pr));document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
	}

	return `import{hydrateRoot as hr}from"react-dom/client";import{createElement as ce}from"react";import P from"${importPath}";const gd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const pr=gd();window.__ECO_PAGE__={module:"${importPath}",props:pr};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);return L?ce(L,null,pe):pe};const m=()=>hr(document,ct(P,pr));document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()`;
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
