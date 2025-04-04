import type { EcoPagesAppConfig } from './internal-types.ts';

declare module 'bun' {
  interface Env {
    ECOPAGES_BASE_URL: string;
    ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
  }
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  namespace NodeJS {
    interface ProcessEnv {
      ECOPAGES_BASE_URL: string;
      ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
    }
  }

  var ecoConfig: EcoPagesAppConfig;
}
