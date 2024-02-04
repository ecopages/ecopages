interface ImportMetaEnv {
  ECO_PAGES_BASE_URL: string;
}

declare module "bun" {
  interface Env extends ImportMetaEnv {}
}
