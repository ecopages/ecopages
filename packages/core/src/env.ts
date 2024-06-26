import type { EcoPagesConfig } from '.';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ECO_PAGES_BASE_URL: string;
      ECO_PAGES_DEBUG: 'true' | 'false';
    }
  }
}

declare global {
  var ecoConfig: EcoPagesConfig;
}
