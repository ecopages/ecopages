/**
 * This module contains the React renderer
 * @module
 */

import path from 'node:path';
import {
	type HtmlTemplateProps,
	IntegrationRenderer,
	type IntegrationRendererRenderOptions,
	type RouteRendererBody,
} from '@ecopages/core';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { rapidhash } from '@ecopages/core/hash';
import {
	AssetFactory,
	AssetProcessingService,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import { createElement, type JSX } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { PLUGIN_NAME } from './react.plugin';
import type { ReactRouterAdapter } from './router-adapter';

/**
 * Error thrown when an error occurs while rendering a React component.
 */
export class ReactRenderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReactRenderError';
	}
}

/**
 * Error thrown when an error occurs while bundling a React component.
 */
export class BundleError extends Error {
	constructor(
		message: string,
		public readonly logs: string[],
	) {
		super(message);
		this.name = 'BundleError';
	}
}

/**
 * Renderer for React components.
 * @extends IntegrationRenderer
 */
export class ReactRenderer extends IntegrationRenderer<JSX.Element> {
	name = PLUGIN_NAME;
	componentDirectory = AssetProcessingService.RESOLVED_ASSETS_DIR;
	static routerAdapter: ReactRouterAdapter | undefined;

	/**
	 * Creates a hydration script for the React page component.
	 * In development mode, registers a global HMR handler that re-renders the component on updates.
	 * If the page has a layout configured via `Page.config.layout`, it will wrap the page in the layout.
	 * When a router adapter is configured, it enables SPA navigation.
	 * @param importPath - The import path for the page component module
	 * @param isDevelopment - Whether to generate development mode script with HMR support
	 */
	private createHydrationScript(importPath: string, isDevelopment = false): string {
		const router = ReactRenderer.routerAdapter;

		if (isDevelopment) {
			if (router) {
				const { importMapKey, components, getRouterProps } = router;
				return `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";
import { ${components.router}, ${components.pageContent} } from "${importMapKey}";
import Page from "${importPath}";

window.__ecopages_hmr_handlers__ = window.__ecopages_hmr_handlers__ || {};
let root = null;

const getPageProps = () => {
  const el = document.getElementById("__ECO_PROPS__");
  if (el?.textContent) {
    try { return JSON.parse(el.textContent); } catch {}
  }
  return {};
};

const createTree = (Component, props) => {
  const Layout = Component.config?.layout;
  const pageContent = createElement(${components.pageContent});
  const layoutElement = Layout ? createElement(Layout, null, pageContent) : pageContent;
  return createElement(${components.router}, ${getRouterProps('Component', 'props')}, layoutElement);
};

const mount = () => {
  const props = getPageProps();
  root = hydrateRoot(document, createTree(Page, props));
  window.__ecopages_hmr_handlers__["${importPath}"] = async (newUrl) => {
    try {
      const newModule = await import(newUrl);
      root.render(createTree(newModule.default, props));
      console.log("[ecopages] React component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload React component:", e);
    }
  };
};

if (document.readyState === "complete") {
  mount();
} else {
  window.onload = mount;
}
`.trim();
			}

			return `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";
import Page from "${importPath}";

window.__ecopages_hmr_handlers__ = window.__ecopages_hmr_handlers__ || {};
let root = null;

const getPageProps = () => {
  const el = document.getElementById("__ECO_PROPS__");
  if (el?.textContent) {
    try { return JSON.parse(el.textContent); } catch {}
  }
  return {};
};

const createTree = (Component, props) => {
  const Layout = Component.config?.layout;
  const pageElement = createElement(Component, props);
  return Layout ? createElement(Layout, null, pageElement) : pageElement;
};

const mount = () => {
  const props = getPageProps();
  root = hydrateRoot(document, createTree(Page, props));
  window.__ecopages_hmr_handlers__["${importPath}"] = async (newUrl) => {
    try {
      const newModule = await import(newUrl);
      root.render(createTree(newModule.default, props));
      console.log("[ecopages] React component updated");
    } catch (e) {
      console.error("[ecopages] Failed to hot-reload React component:", e);
    }
  };
};

if (document.readyState === "complete") {
  mount();
} else {
  window.onload = mount;
}
`.trim();
		}

		if (router) {
			const { importMapKey, components, getRouterProps } = router;
			return `import{hydrateRoot as hr}from"react-dom/client";import{createElement as ce}from"react";import{${components.router} as R,${components.pageContent} as PC}from"${importMapKey}";import P from"${importPath}";const gp=()=>{const e=document.getElementById("__ECO_PROPS__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const ct=(C,p)=>{const L=C.config?.layout;const pc=ce(PC);const le=L?ce(L,null,pc):pc;return ce(R,${getRouterProps('C', 'p')},le)};const m=()=>hr(document,ct(P,gp()));document.readyState==="complete"?m():window.onload=m`;
		}

		return `import{hydrateRoot as hr}from"react-dom/client";import{createElement as ce}from"react";import P from"${importPath}";const gp=()=>{const e=document.getElementById("__ECO_PROPS__");if(e?.textContent){try{return JSON.parse(e.textContent)}catch{}}return{}};const ct=(C,p)=>{const L=C.config?.layout;const pe=ce(C,p);return L?ce(L,null,pe):pe};const m=()=>hr(document,ct(P,gp()));document.readyState==="complete"?m():window.onload=m`;
	}

	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const pathHash = rapidhash(pagePath);
			const componentName = `ecopages-react-${pathHash}`;

			const hmrManager = this.assetProcessingService?.getHmrManager();
			let resolvedAssetImportFilename: string;

			if (hmrManager?.isEnabled()) {
				resolvedAssetImportFilename = await hmrManager.registerEntrypoint(pagePath);
			} else {
				resolvedAssetImportFilename = `/${path
					.join(RESOLVED_ASSETS_DIR, path.relative(this.appConfig.srcDir, pagePath))
					.replace(path.basename(pagePath), `${componentName}.js`)
					.replace(/\\/g, '/')}`;
			}

			const dependencies = [
				AssetFactory.createFileScript({
					position: 'head',
					filepath: pagePath,
					name: componentName,
					excludeFromHtml: true,
					bundle: true,
					bundleOptions: {
						external: [
							'react',
							'react-dom',
							'react/jsx-runtime',
							'react/jsx-dev-runtime',
							'react-dom/client',
						],
						naming: `${componentName}.[ext]`,
						...(import.meta.env.NODE_ENV === 'production' && {
							minify: true,
							splitting: false,
							treeshaking: true,
						}),
					},
					attributes: {
						type: 'module',
						defer: '',
						'data-eco-persist': 'true',
					},
				}),
				AssetFactory.createContentScript({
					position: 'head',
					content: this.createHydrationScript(resolvedAssetImportFilename, hmrManager?.isEnabled() ?? false),
					name: `${componentName}-hydration`,
					bundle: false,
					attributes: {
						type: 'module',
						defer: '',
						'data-eco-persist': 'true',
					},
				}),
			];

			if (!this.assetProcessingService) throw new Error('AssetProcessingService is not set');

			return await this.assetProcessingService.processDependencies(dependencies, componentName);
		} catch (error) {
			if (error instanceof BundleError) console.error('[ecopages] Bundle errors:', error.logs);

			throw new ReactRenderError(
				`Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async render({
		params,
		query,
		props,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
		pageProps,
	}: IntegrationRendererRenderOptions<JSX.Element>): Promise<RouteRendererBody> {
		try {
			const pageElement = createElement(Page, { params, query, ...props });
			const contentElement = Layout
				? createElement(Layout as React.FunctionComponent<{ children: JSX.Element }>, null, pageElement)
				: pageElement;

			return await renderToReadableStream(
				createElement(
					HtmlTemplate,
					{
						metadata,
						pageProps: pageProps || {},
					} as HtmlTemplateProps,
					contentElement,
				),
			);
		} catch (error) {
			throw new ReactRenderError(
				`Failed to render component: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
