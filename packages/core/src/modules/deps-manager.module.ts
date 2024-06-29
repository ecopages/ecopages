import path from 'node:path';
import type { EcoComponent, EcoComponentDependencies } from '@types';

export type WithEcoDependencies = EcoComponent<any> | { dependencies: EcoComponentDependencies };

export type ComponentConfigOptions = {
  importMeta: ImportMeta;
  components?: WithEcoDependencies[];
};

export type ComponentConfigImportOptions = ComponentConfigOptions & {
  scripts?: string[];
  stylesheets?: string[];
};

type DependencyType = 'scripts' | 'stylesheets';

const INDEX_FILE = 'index.ts';
const EXTENSIONS_TO_JS = ['ts', 'tsx', 'jsx'];

/**
 * This function returns the path of the file in the distribution folder.
 * @param {ImportMeta} importMeta - The import meta object.
 * @param {string} pathUrl - The path to the file.
 * @returns {string} - The path to the distribution folder.
 */
function getDependencyDistPath(importMeta: ImportMeta, pathUrl: string): string {
  const { ecoConfig: config } = globalThis;
  const safeFileName = pathUrl.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
  const distUrl = importMeta.url.split(config.srcDir)[1].split(importMeta.file)[0];
  return path.join(distUrl, safeFileName);
}

/**
 * This function is in charge of collecting the dependencies of the components.
 * @param {ComponentConfigImportOptions} options - The options to import the dependencies.
 * @returns {EcoComponentDependencies} - The dependencies of the components.
 */
function collect({
  importMeta,
  scripts,
  stylesheets,
  components,
}: ComponentConfigImportOptions): EcoComponentDependencies {
  const scriptsPaths = [
    ...new Set([
      ...(scripts?.map((script) => getDependencyDistPath(importMeta, script)) || []),
      ...(components?.flatMap((component) => {
        return component.dependencies?.scripts || [];
      }) || []),
    ]),
  ];

  const stylesheetsPaths = [
    ...new Set([
      ...(stylesheets?.map((style) => getDependencyDistPath(importMeta, style)) || []),
      ...(components?.flatMap((component) => {
        return component.dependencies?.stylesheets || [];
      }) || []),
    ]),
  ];

  return {
    scripts: scriptsPaths,
    stylesheets: stylesheetsPaths,
  };
}

/**
 * This function filters the dependencies of the components.
 * @param {WithEcoDependencies} component - The component to extract the dependencies or an object with deps.
 * @param {DependencyType} type - The type of dependency to filter.
 * @returns {EcoComponent<any>} - The component with the filtered dependencies.
 */
function filter(
  { dependencies }: WithEcoDependencies,
  type: DependencyType,
): { dependencies: EcoComponentDependencies } {
  if (!dependencies) return { dependencies: {} };

  return {
    dependencies: {
      [type]: dependencies[type],
    },
  };
}

/**
 * This function extracts a specific set of dependencies from the components.
 * @param {WithEcoDependencies} component - The component to extract the dependencies or an object with deps.
 * @param {DependencyType} type - The type of dependency to extract.
 * @returns {string[]} - The dependencies of the components.
 */
function extract({ dependencies }: WithEcoDependencies, type: DependencyType): string[] {
  if (!dependencies) return [];

  return dependencies[type] || [];
}

export const DepsManager = {
  collect,
  filter,
  extract,
};
