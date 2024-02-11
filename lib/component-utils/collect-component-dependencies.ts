import fs from "fs";
import { defaultTemplateFormats, type EcoComponent } from "root/lib/eco-pages.types";

export type ComponentConfigOptions = {
  importMeta: ImportMeta;
  components?: EcoComponent<any>[];
};

export function DepsManager.collect({
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
    const safeFileName = fileName.replace(".ts", ".js");
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
