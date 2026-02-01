interface EcopagesEnv {
	ECOPAGES_BASE_URL: string;
	ECOPAGES_HOSTNAME: string;
	ECOPAGES_PORT: string;
	ECOPAGES_LOGGER_DEBUG: 'true' | 'false';
}

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EcopagesEnv {}
	}

	namespace Bun {
		interface Env extends EcopagesEnv {}
	}

	interface ImportMetaEnv extends EcopagesEnv {}
}

export {};
