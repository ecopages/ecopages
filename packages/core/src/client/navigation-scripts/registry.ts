/**
 * `__ECO_PAGES__.rerunScripts` registry access for navigation reruns.
 * @module
 */

export type RerunScriptCallback = () => void;

/** Attribute storing the original module `src` after cache-busting. */
export const RERUN_SRC_ATTR = 'data-eco-rerun-src';

/**
 * Returns a registered in-memory rerun callback for the given script id.
 */
export function getRegisteredRerunScript(scriptId: string | null): RerunScriptCallback | null {
	if (!scriptId) {
		return null;
	}

	const runtimeWindow = window as Window &
		typeof globalThis & {
			__ECO_PAGES__?: {
				rerunScripts?: Record<string, RerunScriptCallback | undefined>;
			};
		};

	return runtimeWindow.__ECO_PAGES__?.rerunScripts?.[scriptId] ?? null;
}
