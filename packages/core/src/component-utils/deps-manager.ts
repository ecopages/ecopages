import { defaultTemplateFormats, type EcoComponent, type EcoComponentDependencies } from "@types";
import fs from "fs";
import path from "path";

import { codeToHast } from "shiki/index.mjs";

export type ComponentConfigOptions = {
  importMeta: ImportMeta;
  components?: EcoComponent<any>[];
};

export type ComponentConfigImportOptions = ComponentConfigOptions & {
  scripts?: string[];
  stylesheets?: string[];
};

/**
 * @class DepsManager
 * @description
 * This class is responsible for managing the dependencies of the components.
 * It has methods to import, collect, filter and extract the dependencies of the components.
 */
export class DepsManager {
  /**
   * @method getDistPath
   * @description
   * This method returns the path of the component in the dist folder.
   * @param {ImportMeta} importMeta - The import meta of the component.
   * @param {string} pathUrl - The path of the component.
   * @returns {string} - The path of the component in the dist folder.
   */
  static getDistPath(importMeta: ImportMeta, pathUrl: string): string {
    const { ecoConfig: config } = globalThis;
    const isJsx = pathUrl.includes(".tsx") || pathUrl.includes(".jsx");
    const safeFileName = pathUrl.replace(isJsx ? ".tsx" : ".ts", ".js");
    const distUrl = importMeta.url.split(config.srcDir)[1].split(importMeta.file)[0];
    return path.join(distUrl, safeFileName);
  }

  /**
   * @method import
   * @description
   * This method imports the dependencies of the components.
   * @param {ComponentConfigImportOptions} options - The options to import the dependencies.
   * @returns {EcoComponent<any>["dependencies"]} - The dependencies of the components.
   */
  static import({
    importMeta,
    scripts,
    stylesheets,
    components,
  }: ComponentConfigImportOptions): EcoComponent<any>["dependencies"] {
    const scriptsPath = [
      ...new Set([
        ...(scripts?.map((script) => DepsManager.getDistPath(importMeta, script)) || []),
        ...(components?.flatMap((component) => {
          return component.dependencies?.scripts || [];
        }) || []),
      ]),
    ];

    const stylesheetsPath = [
      ...new Set([
        ...(stylesheets?.map((style) => DepsManager.getDistPath(importMeta, style)) || []),
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
   * @method collect
   * @description
   * This method collects the dependencies of the components.
   * @param {ComponentConfigOptions} options - The options to collect the dependencies.
   * @returns {EcoComponent<any>["dependencies"]} - The dependencies of the components.
   */
  static collect({
    importMeta,
    components = [],
  }: ComponentConfigOptions): EcoComponent<any>["dependencies"] {
    const dependenciesFileName = fs.readdirSync(importMeta.dir).filter((file) => {
      const isIndex = file === "index.ts";
      const isTemplate = Object.keys(defaultTemplateFormats).some((format) =>
        file.includes(`.${format}`)
      );

      return !(isIndex || isTemplate);
    });

    const dependenciesServerPath = importMeta.dir.split("src/")[1];

    const dependencies = dependenciesFileName.map((fileName) => {
      const isJsx = fileName.includes(".tsx") || fileName.includes(".jsx");
      const safeFileName = fileName.replace(isJsx ? ".tsx" : ".ts", ".js");
      return `/${dependenciesServerPath}/${safeFileName}`;
    });

    const stylesheets = [
      ...new Set(
        [
          ...dependencies,
          ...components.flatMap((component) => {
            return component.dependencies?.stylesheets || [];
          }),
        ].filter((file) => file.endsWith(".css"))
      ),
    ];

    const scripts = [
      ...new Set(
        [
          ...dependencies,
          ...components.flatMap((component) => {
            return component.dependencies?.scripts || [];
          }),
        ].filter((file) => file.endsWith(".js"))
      ),
    ];

    return {
      stylesheets,
      scripts,
    };
  }

  /**
   * @method filter
   * @description
   * This method filters the dependencies of the components.
   * @param {EcoComponent<any>} component - The component to filter the dependencies.
   * @param {"scripts" | "stylesheets"} type - The type of the dependencies to filter.
   * @returns {EcoComponent<any>} - The component with the filtered dependencies.
   */
  static filter(component: EcoComponent<any>, type: "scripts" | "stylesheets"): EcoComponent<any> {
    const dependencies = component.dependencies as EcoComponentDependencies;

    if (!dependencies) return component;

    return {
      ...component,
      dependencies: {
        [type]: dependencies[type],
      },
    } as EcoComponent<any>;
  }

  /**
   * @method extract
   * @description
   * This method extracts the dependencies of the components.
   * @param {EcoComponent<any>} component - The component to extract the dependencies.
   * @param {"scripts" | "stylesheets"} type - The type of the dependencies to extract.
   * @returns {string[]} - The dependencies of the components.
   */
  static extract(component: EcoComponent<any>, type: "scripts" | "stylesheets"): string[] {
    const dependencies = component.dependencies as EcoComponentDependencies;

    if (!dependencies) return [];

    return dependencies[type] || [];
  }
}
