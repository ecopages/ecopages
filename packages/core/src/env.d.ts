import type { EcoPagesAppConfig } from './internal-types.ts';

declare module 'bun' {
	interface Env {
		ECOPAGES_BASE_URL: string;
		ECOPAGES_HOSTNAME: string;
		ECOPAGES_PORT: number;
		ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
		REDIS_URL: string;
	}
}

declare global {
	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}

	namespace NodeJS {
		interface ProcessEnv {
			ECOPAGES_BASE_URL: string;
			ECOPAGES_HOSTNAME: string;
			ECOPAGES_PORT: number;
			ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
		}
	}

	var ecoConfig: EcoPagesAppConfig;
}
