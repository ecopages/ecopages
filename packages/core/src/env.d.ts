interface EcopagesEnv {
	ECOPAGES_BASE_URL?: string;
	ECOPAGES_BENCH?: string;
	ECOPAGES_BENCH_VERBOSE?: string;
	ECOPAGES_CONFIG_FILE?: string;
	ECOPAGES_DEBUG?: string;
	ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM?: string;
	ECOPAGES_DEV_RESTART_REASON?: string;
	ECOPAGES_DEV_TOOLBAR?: string;
	ECOPAGES_DIST_DIR?: string;
	ECOPAGES_ENTRY_FILE?: string;
	ECOPAGES_ENTRY_WATCH?: string;
	ECOPAGES_HOSTNAME?: string;
	ECOPAGES_LIT_STATIC_RENDER_WORKER?: string;
	ECOPAGES_LOGGER_DEBUG?: string;
	ECOPAGES_PORT?: string;
	ECOPAGES_PREVIEW_SERVE_ONLY?: string;
	ECOPAGES_PROFILE_BUILD?: string;
	ECOPAGES_REQUEST_PIPELINE_METRICS?: string;
	ECOPAGES_ROLLDOWN_BUILD_METRICS?: string;
	/** Emits startup phase timings to stderr. Also enabled by `ECOPAGES_LOGGER_DEBUG`. */
	ECOPAGES_STARTUP_TRACE?: string;
	ECOPAGES_STARTUP_TRACE_JSON?: string;
	ECOPAGES_UNIFIED_PAGES_GRAPH?: string;
	ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS?: string;
	ECOPAGES_WORK_DIR?: string;
}

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EcopagesEnv {}
	}

	interface ImportMetaEnv extends EcopagesEnv {
		NODE_ENV?: string;
		MODE: string;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}
}

export {};
