import fs from "fs";
import { acceptedTemplateFormats } from "../scripts/collect-html-pages";
import type { EcoComponent } from "@/types";

export type ComponentConfigOptions = {
  importMeta: ImportMeta;
  components?: EcoComponent<any>[];
};

export function getComponentDependencies({
  importMeta,
  components = [],
}: ComponentConfigOptions): string[] {
  const dependenciesFileName = fs.readdirSync(importMeta.dir).filter((file) => {
    const isIndex = file === "index.ts";
    const isTemplate = Object.keys(acceptedTemplateFormats).some((format) =>
      file.includes(`.${format}`)
    );
    return !(isIndex || isTemplate);
  });

  const dependenciesServerPath = importMeta.dir.split("src/")[1];

  const dependencies = dependenciesFileName.map((fileName) => {
    const safeFileName = fileName.replace(".ts", ".js");
    return `${dependenciesServerPath}/${safeFileName}`;
  });

  return [...dependencies, ...components.flatMap((component) => component.dependencies ?? [])];
}
