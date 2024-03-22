import type { EcoPagesConfig } from "@types";
import fs from "node:fs";

const defaultConfig: Omit<EcoPagesConfig, "baseUrl" | "tsAliases" | "watchMode"> = {
  rootDir: ".",
  srcDir: "src",
  pagesDir: "pages",
  globalDir: "global",
  includesDir: "includes",
  componentsDir: "components",
  layoutsDir: "layouts",
  publicDir: "public",
  externalsDir: "externals",
  robotsTxt: {
    preferences: {
      "*": [],
      Googlebot: ["/public/"],
    },
  },
  distDir: ".eco",
  dependencyExtPrefix: "script",
  externalDeps: [],
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
  projectDir?: string;
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

  globalThis.ecoConfig = config;

  return config;
}
