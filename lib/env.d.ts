interface ImportMetaEnv {
  ECO_PAGES_BASE_URL: string;
}

declare global {
  interface ImportMeta {
    env: ImportMetaEnv;
  }
}
