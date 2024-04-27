import type { EcoPagesConfig } from '.';

interface ImportMetaEnv {
  ECO_PAGES_BASE_URL: string;
  PWD: string;
  npm_config_local_prefix: string;
  _: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ECO_PAGES_BASE_URL: string;
      PWD: string;
      npm_config_local_prefix: string;
      _: string;
    }
  }
}

declare global {
  interface ImportMeta {
    env: NodeJS.ProcessEnv;
  }
  var ecoConfig: EcoPagesConfig;
}
