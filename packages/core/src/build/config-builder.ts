import fs from "node:fs";
import path from "node:path";
import type { EcoPagesConfig, EcoPagesConfigInput } from "@types";

export class ConfigBuilder {
  config: EcoPagesConfig;

  static defaultConfig: Omit<EcoPagesConfig, "baseUrl" | "tsAliases" | "absolutePaths" | "serve"> =
    {
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
      },
      error404Template: "404.kita.tsx",
      robotsTxt: {
        preferences: {
          "*": [],
          Googlebot: ["/public/"],
        },
      },
      distDir: ".eco",
      scriptDescriptor: "script",
      templatesExt: [".kita.tsx", ".lit.tsx"],
    };

  constructor({
    projectDir,
    customConfig,
  }: {
    projectDir: string;
    customConfig: EcoPagesConfigInput;
  }) {
    const baseConfig = {
      ...ConfigBuilder.defaultConfig,
      ...customConfig,
    };

    this.config = {
      ...baseConfig,
      absolutePaths: this.getAbsolutePaths(projectDir, baseConfig),
    };

    globalThis.ecoConfig = this.config;
  }

  getAbsolutePaths(
    projectDir: string,
    config: Omit<EcoPagesConfig, "absolutePaths">
  ): EcoPagesConfig["absolutePaths"] {
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
      error404Template,
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
      error404TemplatePath: path.join(absoluteSrcDir, pagesDir, error404Template),
    };
  }

  static async create({ projectDir }: { projectDir: string }): Promise<EcoPagesConfig> {
    if (!fs.existsSync(`${projectDir}/eco.config.ts`)) {
      throw new Error("eco.config.ts not found, please provide a valid config file.");
    }

    const { default: customConfig } = await import(`${projectDir}/eco.config.ts`);

    return new ConfigBuilder({
      projectDir,
      customConfig,
    }).config;
  }
}
