import type { EcoPagesConfig } from './eco-pages';

interface ImportMetaEnv {
  ECO_PAGES_BASE_URL: string;
  PWD: string;
  npm_config_local_prefix: string;
  _: string;
}

declare global {
  interface ImportMeta {
    env: ImportMetaEnv;
  }

  var ecoConfig: EcoPagesConfig;
}
