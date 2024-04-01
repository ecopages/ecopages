import fs from "node:fs";
import path from "node:path";
import type { EcoPagesConfig, EcoPagesConfigInput } from "@types";

export class ConfigBuilder {
  config: EcoPagesConfig;

  static defaultConfig: Omit<
    EcoPagesConfig,
    "baseUrl" | "tsAliases" | "watchMode" | "derivedPaths" | "serve"
  > = {
    rootDir: ".",
    srcDir: "src",
    pagesDir: "pages",
    globalDir: "global",
    includesDir: "includes",
    componentsDir: "components",
    layoutsDir: "layouts",
    publicDir: "public",
    includesTemplates: {
      head: "head.kita.tsx",
      html: "html.kita.tsx",
      seo: "seo.kita.tsx",
      error404: "error404.kita.tsx",
    },
    robotsTxt: {
      preferences: {
        "*": [],
        Googlebot: ["/public/"],
      },
    },
    distDir: ".eco",
    scriptDescriptor: "script",
    templatesExt: [".kita.tsx"],
  };

  constructor({
    projectDir,
    watchMode = false,
    serve = false,
    customConfig,
  }: {
    projectDir: string;
    watchMode: boolean;
    serve: boolean;
    customConfig: EcoPagesConfigInput;
  }) {
    const baseConfig = {
      ...ConfigBuilder.defaultConfig,
      ...customConfig,
      watchMode,
      serve,
    };

    this.config = {
      ...baseConfig,
      derivedPaths: this.createDerivedPaths(projectDir, baseConfig),
    };

    globalThis.ecoConfig = this.config;
  }

  createDerivedPaths(
    projectDir: string,
    config: Omit<EcoPagesConfig, "derivedPaths">
  ): EcoPagesConfig["derivedPaths"] {
    const {
      srcDir,
      componentsDir,
      globalDir,
      includesDir,
      layoutsDir,
      pagesDir,
      publicDir,
      distDir,
      includesTemplates,
    } = config;

    const absoluteSrcDir = path.resolve(projectDir, srcDir);
    const absoluteDistDir = path.resolve(projectDir, distDir);

    return {
      projectDir: projectDir,
      srcDir: absoluteSrcDir,
      distDir: absoluteDistDir,
      componentsDir: path.join(absoluteSrcDir, componentsDir),
      globalDir: path.join(absoluteSrcDir, globalDir),
      includesDir: path.join(absoluteSrcDir, includesDir),
      layoutsDir: path.join(absoluteSrcDir, layoutsDir),
      pagesDir: path.join(absoluteSrcDir, pagesDir),
      publicDir: path.join(absoluteSrcDir, publicDir),
      htmlTemplatePath: path.join(absoluteSrcDir, includesDir, includesTemplates.html),
      error404TemplatePath: path.join(absoluteSrcDir, includesDir, includesTemplates.error404),
    };
  }
}

export async function createGlobalConfig({
  projectDir,
  watchMode = false,
  serve = false,
}: {
  projectDir: string;
  watchMode?: boolean;
  serve?: boolean;
}): Promise<EcoPagesConfig> {
  if (!fs.existsSync(`${projectDir}/eco.config.ts`)) {
    throw new Error("eco.config.ts not found, please provide a valid config file.");
  }

  const { default: customConfig } = await import(`${projectDir}/eco.config.ts`);

  return new ConfigBuilder({
    projectDir,
    watchMode,
    customConfig,
    serve,
  }).config;
}
