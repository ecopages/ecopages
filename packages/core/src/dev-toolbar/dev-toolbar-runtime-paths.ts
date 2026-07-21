import { RESOLVED_ASSETS_DIR } from '../config/constants.ts';

/** On-disk work directory segment for the bundled dev toolbar client runtime. */
export const DEV_TOOLBAR_RUNTIME_WORK_DIR_SEGMENT = 'dev-toolbar-runtime';

/** Browser URL for the bundled dev toolbar client runtime script. */
export const DEV_TOOLBAR_RUNTIME_SCRIPT_URL = '/_dev_toolbar.js';

/** Module import emitted into dev HTML responses. */
export const DEV_TOOLBAR_RUNTIME_IMPORT = `import '${DEV_TOOLBAR_RUNTIME_SCRIPT_URL}'`;

/**
 * Absolute work-directory path for dev toolbar runtime artifacts under an app work dir.
 */
export function resolveDevToolbarRuntimeWorkDir(workDir: string): string {
	return `${workDir}/${RESOLVED_ASSETS_DIR}/${DEV_TOOLBAR_RUNTIME_WORK_DIR_SEGMENT}`;
}
