import {
	ISLAND_HYDRATION_PACKAGE,
	REACT_DOM_CLIENT_PACKAGE,
	REACT_PACKAGE,
} from '../bundling/bootstrap-package-paths.ts';

/** Complete inputs that affect an Island Host entry's generated source. */
export type IslandEntrySourceOptions = {
	importPath: string;
	scriptId: string;
	targetSelector: string;
	componentRef?: string;
	hmrEnabled?: boolean;
};

/**
 * Creates the Island Host entry that imports the component module and
 * delegates lifecycle behavior to `@ecopages/react/island-hydration`.
 *
 * @remarks
 * The entry imports React and the bootstrap by package name. Production bundles it into the app-wide build, and
 * development rewrites those imports to their vendor URLs. No server process compiles the bootstrap.
 */
export function createIslandEntrySource(options: IslandEntrySourceOptions): string {
	const hmrSource = options.hmrEnabled
		? `registerIslandHmr(configuration, (url) => import(url), ${JSON.stringify(options.importPath)});`
		: '';
	return `
import { hydrateRoot } from ${JSON.stringify(REACT_DOM_CLIENT_PACKAGE)};
import { createElement, useEffect, useState, __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE as internals } from ${JSON.stringify(REACT_PACKAGE)};
import * as ComponentModule from ${JSON.stringify(options.importPath)};
import { getIslandHydrationRuntime, mountIslands, registerIslandHmr } from ${JSON.stringify(ISLAND_HYDRATION_PACKAGE)};

const configuration = {
  targetSelector: ${JSON.stringify(options.targetSelector)},
  componentModule: ComponentModule,
  componentRef: ${JSON.stringify(options.componentRef ?? '')},
  scriptId: ${JSON.stringify(options.scriptId)},
  runtime: { hydrateRoot, createElement, useEffect, useState, internals },
  runtimeState: getIslandHydrationRuntime()
};
const mount = () => mountIslands(configuration);
${hmrSource}
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
`.trim();
}
