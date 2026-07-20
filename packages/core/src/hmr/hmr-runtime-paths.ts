import { RESOLVED_ASSETS_DIR } from '../config/constants.ts';

/** On-disk work directory segment under {@link RESOLVED_ASSETS_DIR} for the bundled HMR client runtime. */
export const HMR_RUNTIME_WORK_DIR_SEGMENT = 'hmr-runtime';

/** Browser URL for the bundled HMR client runtime script. */
export const HMR_RUNTIME_SCRIPT_URL = '/_hmr_runtime.js';

/** WebSocket path used by the HMR client runtime for dev server events. */
export const HMR_WEBSOCKET_PATH = '/_hmr';

/**
 * Absolute work-directory path for HMR runtime artifacts under an app work dir.
 */
export function resolveHmrRuntimeWorkDir(workDir: string): string {
	return `${workDir}/${RESOLVED_ASSETS_DIR}/${HMR_RUNTIME_WORK_DIR_SEGMENT}`;
}
