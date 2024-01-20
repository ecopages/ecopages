import fs from "fs";
import { acceptedTemplateFormats } from "../scripts/collect-html-pages";

export type ComponentConfigOptions<T> = {
  template: (args: T) => JSX.Element;
  importMeta: ImportMeta;
};

export type ComponentConfig<T> = {
  template: (args: T) => JSX.Element;
  dependencies: string[];
};

export function getComponentConfig<T>({
  template,
  importMeta,
}: ComponentConfigOptions<T>): ComponentConfig<T> {
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

  return {
    template,
    dependencies,
  };
}
