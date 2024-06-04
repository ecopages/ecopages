import fs from 'node:fs';
import path from 'node:path';
import type { EcoComponent, EcoComponentDependencies, IntegrationPlugin } from '@types';

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
 * This function import explicitly the dependencies of the components.
 * @param {ComponentConfigImportOptions} options - The options to import the dependencies.
 * @returns {EcoComponentDependencies} - The dependencies of the components.
 */
function importPaths({
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

function filterFiles(file: string): boolean {
  const {
    ecoConfig: { integrations },
  } = globalThis;
  const isIndex = file === INDEX_FILE;
  const integrationTemplateExtensions = integrations.flatMap(
    (integration: IntegrationPlugin) => integration.extensions,
  );
  const isTemplate = integrationTemplateExtensions.some((ext: string) => file.includes(ext));

  return !(isIndex || isTemplate);
}

function createDependencies(fileName: string, dependenciesServerPath: string): string {
  const safeFileName = fileName.replace(new RegExp(`\\.(${EXTENSIONS_TO_JS.join('|')})$`), '.js');
  return `/${dependenciesServerPath}/${safeFileName}`;
}

/**
 * This function collects automatically the dependencies of the components.
 * @param {ComponentConfigOptions} options - The options to collect the dependencies.
 * @returns {EcoComponentDependencies} - The dependencies of the components.
 */
function collect({ importMeta, components = [] }: ComponentConfigOptions): EcoComponent<any>['dependencies'] {
  const {
    ecoConfig: { srcDir, rootDir },
  } = globalThis;

  const safeSplit = srcDir === '.' ? `${rootDir}/` : `${srcDir}/`;

  const dependenciesFileName = fs.readdirSync(importMeta.dir).filter(filterFiles);

  const dependenciesServerPath = importMeta.dir.split(safeSplit)[1];

  const dependencies = dependenciesFileName.map((fileName) => createDependencies(fileName, dependenciesServerPath));

  const stylesheets = [
    ...new Set(
      [...dependencies, ...components.flatMap((component) => component.dependencies?.stylesheets || [])].filter(
        (file) => file.endsWith('.css'),
      ),
    ),
  ];

  const scripts = [
    ...new Set(
      [...dependencies, ...components.flatMap((component) => component.dependencies?.scripts || [])].filter((file) =>
        file.endsWith('.js'),
      ),
    ),
  ];

  return {
    stylesheets,
    scripts,
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
  importPaths,
  collect,
  filter,
  extract,
};
