interface EcopagesEnv {
	ECOPAGES_BASE_URL: string;
	ECOPAGES_HOSTNAME: string;
	ECOPAGES_PORT: string;
	ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
	/** When `true`, emits startup phase timings to stderr. Also enabled when `ECOPAGES_LOGGER_DEBUG=true`. */
	ECOPAGES_STARTUP_TRACE?: 'true' | 'false';
}

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EcopagesEnv {}
	}

	interface ImportMetaEnv extends EcopagesEnv {}
}

export {};
