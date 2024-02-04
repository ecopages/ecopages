import type { EcoPagesConfigInput } from "./lib/eco-pages.types";

const config: EcoPagesConfigInput = {
  rootDir: "src",
  pagesDir: "pages",
  globalDir: "global",
  componentsDir: "components",
  includesDir: "includes",
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
};

export default config;
