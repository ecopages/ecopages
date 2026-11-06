/** Complete inputs that affect an Island Host entry's generated source. */
export type IslandEntrySourceOptions = {
	importPath: string;
	scriptId: string;
	reactImportPath: string;
	reactDomClientImportPath: string;
	islandHydrationImportPath: string;
	targetSelector: string;
	componentRef?: string;
	hmrEnabled?: boolean;
};

/**
 * Creates the Island Host entry that imports the component module and
 * delegates lifecycle behavior to `@ecopages/react/island-hydration`.
 *
 * @remarks
 * The entry imports the bootstrap's `/assets/vendors/` URL, like React itself.
 * Route preparation serves it as written; static export bundles it into the
 * app browser build with that URL kept external. No server process compiles
 * the bootstrap.
 */
export function createIslandEntrySource(options: IslandEntrySourceOptions): string {
	const hmrSource = options.hmrEnabled
		? `registerIslandHmr(configuration, (url) => import(url), ${JSON.stringify(options.importPath)});`
		: '';
	return `
import { hydrateRoot } from ${JSON.stringify(options.reactDomClientImportPath)};
import { createElement, useEffect } from ${JSON.stringify(options.reactImportPath)};
import * as ComponentModule from ${JSON.stringify(options.importPath)};
import { getIslandHydrationRuntime, mountIslands, registerIslandHmr } from ${JSON.stringify(options.islandHydrationImportPath)};

const configuration = {
  targetSelector: ${JSON.stringify(options.targetSelector)},
  componentModule: ComponentModule,
  componentRef: ${JSON.stringify(options.componentRef ?? '')},
  scriptId: ${JSON.stringify(options.scriptId)},
  runtime: { hydrateRoot, createElement, useEffect },
  runtimeState: getIslandHydrationRuntime()
};
const mount = () => mountIslands(configuration);
${hmrSource}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
`.trim();
}
