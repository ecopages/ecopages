import type { EcoPagesConfigInput } from "@eco-pages/core";
import tsConfig from "./tsconfig.json";

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL!,
  tsAliases: {
    baseUrl: tsConfig.compilerOptions.baseUrl,
    paths: tsConfig.compilerOptions.paths,
  },
};

export default config;
