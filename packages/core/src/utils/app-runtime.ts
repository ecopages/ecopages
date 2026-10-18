export const MISSING_APP_RUNTIME = 'Missing app runtime. This config was never assembled.';

/**
 * Returns the runtime attached during app config assembly.
 *
 * @throws When the config has no runtime, which means it skipped finalization.
 */
export function requireAppRuntime<TRuntime>(owner: { appRuntime?: TRuntime | null }): TRuntime {
	const runtime = owner.appRuntime;
	if (runtime === undefined || runtime === null) {
		throw new Error(MISSING_APP_RUNTIME);
	}

	return runtime;
}
