import type { EcoPagesConfig } from "root/lib/eco-pages.types";
import fs from "node:fs";

const defaultConfig: Omit<EcoPagesConfig, "baseUrl"> = {
  rootDir: ".",
  srcDir: "src",
  pagesDir: "pages",
  globalDir: "global",
  includesDir: "includes",
  componentsDir: "components",
  layoutsDir: "layouts",
  publicDir: "public",
  robotsTxt: {
    preferences: {
      "*": [],
      Googlebot: ["/public/"],
    },
  },
  distDir: ".eco",
};

export async function getConfig(projectDir?: string): Promise<Required<EcoPagesConfig>> {
  if (!fs.existsSync(`${projectDir}/eco.config.ts`)) {
    throw new Error("eco.config.ts not found, please provide a valid config file.");
  }

  const { default: customConfig } = await import(`${projectDir}/eco.config.ts`);

  return {
    ...defaultConfig,
    ...customConfig,
  };
}
