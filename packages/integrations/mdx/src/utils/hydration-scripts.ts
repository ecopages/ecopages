/**
 * Hydration script generators for MDX pages.
 * These functions create the client-side scripts that hydrate MDX React components.
 * @module
 */

/**
 * Options for generating an MDX hydration script.
 */
export interface MDXHydrationScriptOptions {
	importPath: string;
	isDevelopment: boolean;
}

/**
 * Creates a development hydration script with HMR support for MDX components.
 *
 * This script is responsible for:
 * 1. Importing the bundled MDX component.
 * 2. Checking if a `layout` export exists.
 * 3. Composing the Page within the Layout if present.
 * 4. Hydrating the React root.
 * 5. Registering an HMR handler for hot updates.
 */
function createDevScript(importPath: string): string {
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

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
} else {
    mount();
}
`.trim();
}

/**
 * Creates a production hydration script for MDX components.
 *
 * This script is responsible for:
 * 1. Importing the bundled MDX component.
 * 2. Checking if a `layout` export exists.
 * 3. Composing the Page within the Layout if present.
 * 4. Hydrating the React root.
 */
function createProdScript(importPath: string): string {
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
 * Creates a hydration script for client-side MDX React hydration.
 * Generates appropriate script based on environment.
 */
export function createMDXHydrationScript(options: MDXHydrationScriptOptions): string {
	const { importPath, isDevelopment } = options;
	return isDevelopment ? createDevScript(importPath) : createProdScript(importPath);
}
