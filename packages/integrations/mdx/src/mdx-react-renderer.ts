/**
 * This module contains the MDX renderer for Ecopages.
 *
 * # MDX React Renderer Walkthrough
 *
 * This renderer handles the processing, bundling, and rendering of .mdx files within the Ecopages framework.
 * Unlike standard React rendering, MDX requires a compile step to transform markdown content into a React component.
 *
 * ## Architecture Overview
 *
 * 1. **Global Plugin Registration**:
 *    The `MDXPlugin` (defined in `mdx-react.plugin.ts`) registers a global Bun plugin (`@mdx-js/esbuild`).
 *    This allows Bun to understand how to import and bundle `.mdx` files natively.
 *
 * 2. **File-Based Bundling**:
 *    Instead of manually compiling MDX strings, this renderer uses `AssetFactory.createFileScript` to point directly
 *    to the source `.mdx` file. The `AssetProcessingService` then bundles this file. Because the Bun plugin is
 *    registered globally, the bundler automatically transforms the MDX syntax into a JavaScript module.
 *
 * 3. **Client-Side Hydration & Layouts**:
 *    The hydration script is generated dynamically. It imports the bundled MDX component and checks for a `layout` export.
 *    If a layout is present, it wraps the page component within the layout before hydration. This moves the composition
 *    logic to the client, simplifying the server-side asset generation.
 *
 * @module
 */

import path from 'node:path';
import {
	type EcoComponent,
	type EcoComponentConfig,
	type EcoPageFile,
	type GetMetadata,
	IntegrationRenderer,
	type IntegrationRendererRenderOptions,
	invariant,
	type PageMetadataProps,
	type RouteRendererBody,
} from '@ecopages/core';
import { RESOLVED_ASSETS_DIR } from '@ecopages/core/constants';
import { rapidhash } from '@ecopages/core/hash';
import React, { type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { PLUGIN_NAME } from './mdx.plugin';
import {
	AssetFactory,
	type AssetProcessingService,
	type ProcessedAsset,
} from '@ecopages/core/services/asset-processing-service';
import type { CompileOptions } from '@mdx-js/mdx';
import mdx from '@mdx-js/esbuild';

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
 * A structure representing an MDX file export.
 */
export type MDXReactFile = {
	/** The default export which is the converted MDX content as a React component. */
	default: ReactNode;
	/** Optional page-specific configuration. */
	config?: EcoComponentConfig;
	/** Function to retrieve page metadata. */
	getMetadata: GetMetadata;
};

/**
 * Options for the MDX integration renderer.
 */
interface MDXReactIntegrationRendererOptions<C = ReactNode> extends IntegrationRendererRenderOptions<C> {
	/** Optional page-specific configuration. */
	config?: EcoComponentConfig;
}

/**
 * The MDXReactRenderer Class.
 *
 * This class extends the base `IntegrationRenderer` to provide specialized handling for MDX files.
 * It is responsible for:
 * - Server-Side Rendering (SSR) of the MDX content to HTML.
 * - Generating client-side assets (bundled JS) for hydration.
 * - Importing and parsing page files to extract metadata and configuration.
 */
export class MDXReactRenderer extends IntegrationRenderer {
	name = PLUGIN_NAME;
	compilerOptions: CompileOptions;

	constructor({
		compilerOptions,
		...options
	}: {
		appConfig: any;
		assetProcessingService: AssetProcessingService;
		resolvedIntegrationDependencies: ProcessedAsset[];
		runtimeOrigin: string;
		compilerOptions?: CompileOptions;
	}) {
		super(options);
		this.compilerOptions = compilerOptions || {};
	}

	/**
	 * Creates a client-side hydration script.
	 *
	 * This script is responsible for:
	 * 1. Importing the bundled MDX component.
	 * 2. Checking if a `layout` export exists.
	 * 3. Composing the Page within the Layout if present.
	 * 4. Hydrating the React root.
	 * 5. In development mode, registering an HMR handler for hot updates.
	 *
	 * @param importPath - The public path to the bundled component file.
	 * @param isDevelopment - Whether to generate development mode script with HMR support.
	 */
	private createHydrationScript(importPath: string, isDevelopment = false): string {
		if (isDevelopment) {
			return `
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import * as MDXComponent from "${importPath}";

window.__ecopages_hmr_handlers__ = window.__ecopages_hmr_handlers__ || {};
let root = null;

const { default: Page, config } = MDXComponent;
const resolvedLayout = config?.layout;

async function mount() {
    try {
        const container = document.querySelector('[data-react-root]');
        if (!container) return;
        
        const element = resolvedLayout 
            ? createElement(resolvedLayout, null, createElement(Page))
            : createElement(Page);
            
        root = hydrateRoot(container, element);
        
        // Register HMR handler
        window.__ecopages_hmr_handlers__["${importPath}"] = async (newUrl) => {
            try {
                const newModule = await import(newUrl);
                const { default: NewPage, config: newConfig } = newModule;
                const newResolvedLayout = newConfig?.layout;
                const newElement = newResolvedLayout 
                    ? createElement(newResolvedLayout, null, createElement(NewPage))
                    : createElement(NewPage);
                root.render(newElement);
                console.log("[ecopages] MDX component updated");
            } catch (e) {
                console.error("[ecopages] Failed to hot-reload MDX component:", e);
            }
        };
    } catch (error) {
        console.error('[MDX React] Hydration failed:', error);
    }
}

if (document.readyState === 'complete') {
    mount();
} else {
    window.onload = mount;
}
`.trim();
		}

		return `
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import * as MDXComponent from "${importPath}";

const { default: Page, config } = MDXComponent;
const resolvedLayout = config?.layout;

async function hydrate() {
    try {
        const root = document.querySelector('[data-react-root]');
        if (!root) return;
        
        const element = resolvedLayout 
            ? createElement(resolvedLayout, null, createElement(Page))
            : createElement(Page);
            
        hydrateRoot(root, element);
    } catch (error) {
        console.error('[MDX React] Hydration failed:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate);
} else {
    hydrate();
}
        `.trim();
	}

	/**
	 * Builds values for the route.
	 *
	 * This method prepares the assets needed for the client-side hydration of the MDX page.
	 * It creates two main assets:
	 *
	 * 1. **Content Script**: The bundled MDX file itself.
	 *    We use \`AssetFactory.createFileScript\` to reference the source file directly.
	 *    The `AssetProcessingService` bundles this file using the globally registered MDX plugin.
	 *
	 * 2. **Hydration Script**: A small inline script (generated by \`createHydrationScript\`)
	 *    that imports the bundled file and initializes the React app on the client.
	 *
	 * @param pagePath - The absolute path to the MDX page file.
	 * @returns A promise resolving to the list of processed assets.
	 */
	override async buildRouteRenderAssets(pagePath: string): Promise<ProcessedAsset[]> {
		try {
			const pathHash = rapidhash(pagePath);
			const componentName = `ecopages-react-${pathHash}`;

			const absolutePagePath = path.resolve(pagePath);
			const relativePath = path.relative(this.appConfig.srcDir, absolutePagePath);

			const resolvedAssetImportFilename = `/${path
				.join(RESOLVED_ASSETS_DIR, relativePath)
				.replace(path.basename(pagePath), `${componentName}.js`)
				.replace(/\\/g, '/')}`;

			const fileScript = AssetFactory.createFileScript({
				position: 'head',
				filepath: pagePath,
				name: componentName,
				excludeFromHtml: true,
				bundle: true,
				bundleOptions: {
					loading: 'lazy',
					external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
					naming: `${componentName}.[ext]`,
					plugins: [mdx(this.compilerOptions)],
					...(import.meta.env.NODE_ENV === 'production' && {
						minify: true,
						splitting: false,
						treeshaking: true,
					}),
				} as any,
				attributes: {
					type: 'module',
					defer: '',
				},
			});

			if (!this.assetProcessingService) throw new Error('AssetProcessingService is not set');

			const [processedFileScript] = await this.assetProcessingService.processDependencies(
				[fileScript],
				componentName,
			);

			const resolvedScriptUrl = processedFileScript.srcUrl || resolvedAssetImportFilename;

			const hmrManager = this.assetProcessingService.getHmrManager?.();
			const isDevelopment = hmrManager?.isEnabled() ?? false;

			const hydrationScript = AssetFactory.createContentScript({
				position: 'head',
				content: this.createHydrationScript(resolvedScriptUrl, isDevelopment),
				name: `${componentName}-hydration`,
				bundle: false,
				attributes: {
					type: 'module',
					defer: '',
				},
			});

			const [processedHydrationScript] = await this.assetProcessingService.processDependencies(
				[hydrationScript],
				componentName,
			);
			const reactAssets = [processedFileScript, processedHydrationScript];

			const { config } = await this.importPageFile(pagePath);
			const resolvedLayout = config?.layout;
			const components: Partial<EcoComponent>[] = [];

			if (resolvedLayout?.config?.dependencies) {
				components.push({ config: resolvedLayout.config });
			}

			if (config?.dependencies) {
				const configWithMeta = {
					...config,
					componentDir: path.dirname(pagePath),
				};
				components.push({ config: configWithMeta });
			}

			const configAssets = await this.processComponentDependencies(components);

			return [...reactAssets, ...configAssets];
		} catch (error) {
			if (error instanceof BundleError) console.error('[ecopages] Bundle errors:', error.logs);

			throw new ReactRenderError(
				`Failed to generate hydration script: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	protected override async importPageFile(file: string): Promise<
		EcoPageFile<{
			config?: EcoComponentConfig;
		}>
	> {
		try {
			const mdxModule = await import(file);

			const { default: Page, getMetadata, config } = mdxModule;

			if (typeof Page !== 'function') {
				throw new Error(`MDX file must export a default function, got ${typeof Page}: ${String(Page)}`);
			}

			return {
				default: Page,
				getMetadata,
				config,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			invariant(false, `Error importing MDX file: ${errorMessage}`);
		}
	}

	async render({
		metadata,
		Page,
		HtmlTemplate,
		Layout,
	}: MDXReactIntegrationRendererOptions): Promise<RouteRendererBody> {
		try {
			if (typeof Page !== 'function') {
				throw new Error(`Page must be a React component function, got ${typeof Page}: ${String(Page)}`);
			}

			const pageElement = Layout
				? React.createElement(
						Layout as React.ComponentType,
						undefined,
						React.createElement(Page as React.ComponentType),
					)
				: React.createElement(Page as React.ComponentType);

			const children = React.createElement(
				'div',
				{
					'data-react-root': true,
				},
				pageElement,
			);

			const htmlElement = React.createElement(
				HtmlTemplate as React.ComponentType<{
					children: ReactNode;
					metadata: PageMetadataProps;
				}>,
				{
					metadata,
					// oxlint-disable-next-line no-children-prop
					children,
				},
			);

			const body = renderToString(htmlElement);

			return this.DOC_TYPE + body;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`[ecopages] Error rendering page: ${errorMessage}`, { cause: error });
		}
	}
}

/**
 * Factory function to create an MDX React renderer class with specific compiler options.
 *
 * @param compilerOptions - Compiler options for MDX compilation.
 * Note: These are passed to ensure strict typing adherence to the interface expected by `mdx-react.plugin.ts`.
 * In the current implementation, the compilation is handled by the global plugin registered in `MDXPlugin`,
 * so these options are not directly used in the renderer logic but are consistent with the plugin configuration.
 *
 * @returns A new MDXReactRenderer class extended with the provided context.
 */
export function createMDXReactRenderer(compilerOptions: CompileOptions): typeof MDXReactRenderer {
	return class extends MDXReactRenderer {
		constructor(options: {
			appConfig: any;
			assetProcessingService: AssetProcessingService;
			resolvedIntegrationDependencies: ProcessedAsset[];
			runtimeOrigin: string;
		}) {
			super({
				...options,
				compilerOptions,
			});
		}
	};
}
