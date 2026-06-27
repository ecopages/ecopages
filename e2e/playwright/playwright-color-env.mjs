/**
 * Playwright color env normalization.
 *
 * Playwright controls reporter/debug color via FORCE_COLOR and DEBUG_COLORS.
 * Shells and CI often set NO_COLOR instead; Playwright workers may set FORCE_COLOR,
 * which makes Node warn when both are present. Honor no-color intent with Playwright's
 * supported variables: https://github.com/microsoft/playwright/issues/32543
 */
export function shouldDisablePlaywrightColors(env) {
	if (env.CI === 'true' || env.CI === '1') {
		return true;
	}

	if (env.FORCE_COLOR === '0' || env.FORCE_COLOR === 'false') {
		return true;
	}

	if (env.DEBUG_COLORS === '0' || env.DEBUG_COLORS === 'false') {
		return true;
	}

	// NO_COLOR spec: any non-empty value disables color output.
	if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
		return true;
	}

	return false;
}

export function configurePlaywrightColorEnv(env = process.env) {
	if (!shouldDisablePlaywrightColors(env)) {
		return env;
	}

	env.FORCE_COLOR = '0';
	env.DEBUG_COLORS = '0';
	delete env.NO_COLOR;
	return env;
}

export function createPlaywrightSubprocessEnv(overrides = {}) {
	return configurePlaywrightColorEnv({ ...process.env, ...overrides });
}
