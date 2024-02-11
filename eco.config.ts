import type { EcoPagesConfigInput } from "./lib/eco-pages.types";
import tsConfig from "./tsconfig.json";

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  srcDir: "src",
  pagesDir: "pages",
  globalDir: "global",
  componentsDir: "components",
  includesDir: "includes",
  externalsDir: "externals",
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL!,
  tsAliases: {
    baseUrl: tsConfig.compilerOptions.baseUrl,
    paths: tsConfig.compilerOptions.paths,
  },
  externalDeps: ["lit", "alpinejs"],
};

export default config;
