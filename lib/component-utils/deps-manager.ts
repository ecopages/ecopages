import fs from "fs";
import {
  defaultTemplateFormats,
  type EcoComponent,
  type EcoComponentDependencies,
} from "root/lib/eco-pages.types";

export type ComponentConfigOptions = {
  importMeta: ImportMeta;
  components?: EcoComponent<any>[];
};

export class DepsManager {
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

  static extract(component: EcoComponent<any>, type: "scripts" | "stylesheets"): string[] {
    const dependencies = component.dependencies as EcoComponentDependencies;

    if (!dependencies) return [];

    return dependencies[type] || [];
  }
}
