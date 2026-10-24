export const REACT_PLUGIN_NAME = 'react';

/** React's documented prerender abort delay, used when `reactPlugin()` does not set `renderTimeoutMs`. */
export const REACT_SSR_RENDER_TIMEOUT_MS = 10_000;

/** The longest delay Node's `setTimeout` honours; a longer one fires after 1 ms instead. */
export const REACT_SSR_RENDER_TIMEOUT_MAX_MS = 2_147_483_647;
