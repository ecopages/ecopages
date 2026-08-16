/** Dev/preview port for the llm-wiki Ecopages app (avoids clashing with other local services on 3000). */
export const LLM_WIKI_PORT = 3333;

/** Public origin for absolute URLs in generated exports and `eco.config` `baseUrl`. */
export const LLM_WIKI_ORIGIN = process.env.ECOPAGES_BASE_URL ?? `http://localhost:${LLM_WIKI_PORT}`;
