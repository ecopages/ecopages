import fs from 'node:fs';
import path from 'node:path';
import { type EcoComponent, type EcoComponentDependencies, defaultTemplateEngines } from '@types';

export type ComponentConfigOptions = {
  importMeta: ImportMeta;
  components?: EcoComponent<unknown>[];
};

export type ComponentConfigImportOptions = ComponentConfigOptions & {
  scripts?: string[];
  stylesheets?: string[];
};

/**
 * This method returns the path of the component in the dist folder.
 * @param {ImportMeta} importMeta - The import meta of the component.
 * @param {string} pathUrl - The path of the component.
 * @returns {string} - The path of the component in the dist folder.
 */
function getDistPath(importMeta: ImportMeta, pathUrl: string): string {
  const { ecoConfig: config } = globalThis;
  const isJsx = pathUrl.includes('.tsx') || pathUrl.includes('.jsx');
  const safeFileName = pathUrl.replace(isJsx ? '.tsx' : '.ts', '.js');
  const distUrl = importMeta.url.split(config.srcDir)[1].split(importMeta.file)[0];
  return path.join(distUrl, safeFileName);
}

/**
 * This method imports the dependencies of the components.
 * @param {ComponentConfigImportOptions} options - The options to import the dependencies.
 * @returns {EcoComponent<unknown>["dependencies"]} - The dependencies of the components.
 */
function importPaths({
  importMeta,
  scripts,
  stylesheets,
  components,
}: ComponentConfigImportOptions): EcoComponent<unknown>['dependencies'] {
  const scriptsPath = [
    ...new Set([
      ...(scripts?.map((script) => getDistPath(importMeta, script)) || []),
      ...(components?.flatMap((component) => {
        return component.dependencies?.scripts || [];
      }) || []),
    ]),
  ];

  const stylesheetsPath = [
    ...new Set([
      ...(stylesheets?.map((style) => getDistPath(importMeta, style)) || []),
      ...(components?.flatMap((component) => {
        return component.dependencies?.stylesheets || [];
      }) || []),
    ]),
  ];

  return {
    scripts: scriptsPath,
    stylesheets: stylesheetsPath,
  };
}

/**
 * This method collects the dependencies of the components.
 * @param {ComponentConfigOptions} options - The options to collect the dependencies.
 * @returns {EcoComponent<unknown>["dependencies"]} - The dependencies of the components.
 */
function collect({ importMeta, components = [] }: ComponentConfigOptions): EcoComponent<unknown>['dependencies'] {
  const dependenciesFileName = fs.readdirSync(importMeta.dir).filter((file) => {
    const isIndex = file === 'index.ts';
    const isTemplate = Object.keys(defaultTemplateEngines).some((format) => file.includes(`.${format}`));

    return !(isIndex || isTemplate);
  });

  const dependenciesServerPath = importMeta.dir.split('src/')[1];

  const dependencies = dependenciesFileName.map((fileName) => {
    const isJsx = fileName.includes('.tsx') || fileName.includes('.jsx');
    const safeFileName = fileName.replace(isJsx ? '.tsx' : '.ts', '.js');
    return `/${dependenciesServerPath}/${safeFileName}`;
  });

  const stylesheets = [
    ...new Set(
      [
        ...dependencies,
        ...components.flatMap((component) => {
          return component.dependencies?.stylesheets || [];
        }),
      ].filter((file) => file.endsWith('.css')),
    ),
  ];

  const scripts = [
    ...new Set(
      [
        ...dependencies,
        ...components.flatMap((component) => {
          return component.dependencies?.scripts || [];
        }),
      ].filter((file) => file.endsWith('.js')),
    ),
  ];

  return {
    stylesheets,
    scripts,
  };
}

/**
 * This method filters the dependencies of the components.
 * @param {EcoComponent<unknown>} component - The component to filter the dependencies.
 * @param {"scripts" | "stylesheets"} type - The type of the dependencies to filter.
 * @returns {EcoComponent<unknown>} - The component with the filtered dependencies.
 */
function filter(component: EcoComponent<unknown>, type: 'scripts' | 'stylesheets'): EcoComponent<unknown> {
  const dependencies = component.dependencies as EcoComponentDependencies;

  if (!dependencies) return component;

  return {
    ...component,
    dependencies: {
      [type]: dependencies[type],
    },
  } as EcoComponent<unknown>;
}

/**
 * @method extract
 * @description
 * This method extracts the dependencies of the components.
 * @param {EcoComponent<unknown>} component - The component to extract the dependencies from.
 * @param {"scripts" | "stylesheets"} type - The type of the dependencies to extract.
 * @returns {string[]} - The dependencies of the components.
 */
function extract(component: EcoComponent<unknown>, type: 'scripts' | 'stylesheets'): string[] {
  const dependencies = component.dependencies as EcoComponentDependencies;

  if (!dependencies) return [];

  return dependencies[type] || [];
}

export const DepsManager = {
  importPaths,
  collect,
  filter,
  extract,
};
