/**
 * This module contains a set of utility functions to work with component dependencies
 * @module
 */

import type { EcoComponent, EcoComponentDependencies } from '@types';

function getSafeFileName(path: string) {
  const EXTENSIONS_TO_JS = ['ts', 'tsx'];
  const safeFileName = path.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
  return safeFileName;
}

/**
 * It resolves the scripts of the components dependencies
 * @function resolveComponentsScripts
 * @param {EcoComponent[]} components
 * @returns {string}
 */
export function resolveComponentsScripts(components: Required<EcoComponentDependencies>['components']) {
  return components
    .flatMap((component) => {
      const baseDir = component.config?.importMeta.dir.split(globalThis.ecoConfig.srcDir)[1];
      const dependencies = component.config?.dependencies?.scripts || [];
      return dependencies.map((fileName) => `${baseDir}/${getSafeFileName(fileName)}`);
    })
    .join();
}

/**
 * It removes the scripts from the components dependencies
 * @function removeComponentsScripts
 * @param {EcoComponent[]} components
 * @returns {EcoComponent[]}
 */
export function removeComponentsScripts(components: EcoComponent[]) {
  const filteredComponents = [];

  for (const component of components) {
    if (!component.config?.dependencies) {
      continue;
    }

    const { scripts, ...otherDependencies } = component.config.dependencies;

    filteredComponents.push({
      ...component,
      config: {
        ...component.config,
        dependencies: otherDependencies,
      },
    });
  }

  return filteredComponents;
}
