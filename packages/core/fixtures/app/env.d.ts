import type { EcoPagesAppConfig } from './internal-types.ts';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ECOPAGES_BASE_URL: string;
      ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
    }
  }
}

declare global {
  var ecoConfig: EcoPagesAppConfig;
}
