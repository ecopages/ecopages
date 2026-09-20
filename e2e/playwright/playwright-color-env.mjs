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

const PLAYWRIGHT_INSPECTOR_ENV_KEYS = ['PWDEBUG', 'npm_config_pwdebug', 'npm_package_config_pwdebug'];

export function shouldKeepPlaywrightInspector(argv = process.argv) {
	return argv.some((arg) => arg === '--debug' || arg.startsWith('--debug='));
}

/**
 * Drop inherited Playwright inspector flags so default test runs stay headless.
 *
 * @remarks
 * Any non-empty `PWDEBUG` other than `"0"` / `"false"` forces headed Chromium and
 * the inspector. Cursor and some shells leave it set; Playwright also reads
 * `npm_config_pwdebug`. `playwright-core` snapshots the value on first load, so
 * callers must strip before importing Playwright.
 */
export function stripInheritedPlaywrightInspectorEnv(env) {
	for (const key of PLAYWRIGHT_INSPECTOR_ENV_KEYS) {
		delete env[key];
	}

	return env;
}

export function createPlaywrightSubprocessEnv(overrides = {}) {
	return configurePlaywrightColorEnv(stripInheritedPlaywrightInspectorEnv({ ...process.env, ...overrides }));
}
