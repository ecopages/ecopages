import fs from "node:fs";
import path from "node:path";
import type { EcoPagesConfig } from "@types";

const defaultConfig: Omit<EcoPagesConfig, "baseUrl" | "tsAliases" | "watchMode" | "derivedPaths"> =
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

/**
 * Create the global config for the eco-pages.
 * It will merge the default config with the custom config provided by the user.
 * It will be stored in the globalThis object and can be accessed from anywhere in the code using globalThis.ecoConfig.
 * @param projectDir The project directory.
 * @param watchMode If the watch mode is enabled.
 */
export async function createGlobalConfig({
  projectDir,
  watchMode,
}: {
  projectDir: string;
  watchMode: boolean;
}): Promise<Required<EcoPagesConfig>> {
  if (!fs.existsSync(`${projectDir}/eco.config.ts`)) {
    throw new Error("eco.config.ts not found, please provide a valid config file.");
  }

  const { default: customConfig } = await import(`${projectDir}/eco.config.ts`);

  const config = {
    ...defaultConfig,
    ...customConfig,
    watchMode,
  };

  const derivedPaths: EcoPagesConfig["derivedPaths"] = {
    projectDir: projectDir,
    componentsDir: path.join(projectDir, config.srcDir, config.componentsDir),
    globalDir: path.join(projectDir, config.srcDir, config.globalDir),
    includesDir: path.join(projectDir, config.srcDir, config.includesDir),
    layoutsDir: path.join(projectDir, config.srcDir, config.layoutsDir),
    pagesDir: path.join(projectDir, config.srcDir, config.pagesDir),
    publicDir: path.join(projectDir, config.srcDir, config.publicDir),
    distDir: path.join(projectDir, config.distDir),
    srcDir: config.srcDir,
    htmlTemplatePath: path.join(
      projectDir,
      config.srcDir,
      config.includesDir,
      config.includesTemplates.html
    ),
    error404TemplatePath: path.join(
      projectDir,
      config.srcDir,
      config.includesDir,
      config.includesTemplates.error404
    ),
  };

  globalThis.ecoConfig = {
    ...config,
    derivedPaths,
  };

  return config;
}
