/**
 * This module contains a set of utility functions to work with component dependencies
 * @module
 */

import { RESOLVED_ASSETS_DIR } from '../constants.ts';
import type { EcoComponent, EcoComponentDependencies, EcoWebComponent } from '../public-types.ts';

function getSafeFileName(path: string): string {
  const EXTENSIONS_TO_JS = ['ts', 'tsx'];
  const safeFileName = path.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
  return safeFileName.startsWith('./') ? safeFileName.slice(2) : safeFileName;
}

/**
 * It resolves the scripts of the components dependencies
 * @function resolveComponentsScripts
 * @param {EcoComponent[]} components
 * @returns {string}
 */
export function resolveComponentsScripts(components: Required<EcoComponentDependencies>['components']): string {
  const normalizePath = (baseDir: string, fileName: string): string => {
    return [RESOLVED_ASSETS_DIR, baseDir, getSafeFileName(fileName)].filter(Boolean).join('/').replace(/\/+/g, '/');
  };

  return components
    .flatMap((component) => {
      const baseDir = component.config?.importMeta.dir.split(globalThis.ecoConfig.srcDir)[1] ?? '';
      const scripts = component.config?.dependencies?.scripts ?? [];

      return scripts.map((script) => normalizePath(baseDir, script));
    })
    .filter(Boolean)
    .join(',');
}

/**
 * It marks scripts as dynamic by adding ?dynamic=true to their paths
 * @deprecated This function is deprecated and will be removed in the next versions. Use `flagComponentsAsDynamic` instead.
 * @function removeComponentsScripts
 * @param {EcoComponent[]} components
 * @returns {EcoComponent[]}
 */
export function removeComponentsScripts(
  components: (EcoComponent | EcoWebComponent)[],
): (EcoComponent | EcoWebComponent)[] {
  return components.map((component) => {
    if (!component.config?.dependencies?.scripts) {
      return component;
    }

    return {
      ...component,
      config: {
        ...component.config,
        dependencies: {
          ...component.config.dependencies,
          scripts: component.config.dependencies.scripts.map((script) => `${script}?dynamic=true`),
        },
      },
    };
  });
}

/**
 * It marks scripts as dynamic by adding ?dynamic=true to their paths
 * @function removeComponentsScripts
 * @param {EcoComponent[]} components
 * @returns {EcoComponent[]}
 */
export function flagComponentsAsDynamic(
  components: (EcoComponent | EcoWebComponent)[],
): (EcoComponent | EcoWebComponent)[] {
  return components.map((component) => {
    if (!component.config?.dependencies?.scripts) {
      return component;
    }

    return {
      ...component,
      config: {
        ...component.config,
        dependencies: {
          ...component.config.dependencies,
          scripts: component.config.dependencies.scripts.map((script) => `${script}?dynamic=true`),
        },
      },
    };
  });
}
