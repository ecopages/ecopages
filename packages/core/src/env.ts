import type { EcoPagesConfig } from '.';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ECO_PAGES_BASE_URL: string;
      ECO_PAGES_DEBUG: 'true' | 'false';
      PWD: string;
      npm_config_local_prefix: string;
      _: string;
    }
  }
}

declare global {
  var ecoConfig: EcoPagesConfig;
}
