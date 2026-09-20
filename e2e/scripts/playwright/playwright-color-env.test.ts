import { describe, expect, it } from 'vitest';
import {
	configurePlaywrightColorEnv,
	createPlaywrightSubprocessEnv,
	shouldDisablePlaywrightColors,
	shouldKeepPlaywrightInspector,
	stripInheritedPlaywrightInspectorEnv,
} from '../../playwright/playwright-color-env.mjs';

describe('playwright color and inspector env', () => {
	it('shouldDisablePlaywrightColors honors NO_COLOR, CI, and Playwright disable flags', () => {
		expect(shouldDisablePlaywrightColors({ NO_COLOR: '1' })).toBe(true);
		expect(shouldDisablePlaywrightColors({ CI: 'true' })).toBe(true);
		expect(shouldDisablePlaywrightColors({ FORCE_COLOR: '0' })).toBe(true);
		expect(shouldDisablePlaywrightColors({ DEBUG_COLORS: 'false' })).toBe(true);
		expect(shouldDisablePlaywrightColors({})).toBe(false);
	});

	it('configurePlaywrightColorEnv maps no-color intent to Playwright env vars', () => {
		const env = configurePlaywrightColorEnv({
			NO_COLOR: '1',
			FORCE_COLOR: '1',
			DEBUG_COLORS: '1',
			EXAMPLE: 'value',
		});

		expect(env.NO_COLOR).toBeUndefined();
		expect(env.FORCE_COLOR).toBe('0');
		expect(env.DEBUG_COLORS).toBe('0');
		expect(env.EXAMPLE).toBe('value');
	});

	it('createPlaywrightSubprocessEnv applies overrides after color normalization', () => {
		const previousNoColor = process.env.NO_COLOR;
		process.env.NO_COLOR = '1';

		try {
			const env = createPlaywrightSubprocessEnv({ EXAMPLE: 'value' });
			expect(env.NO_COLOR).toBeUndefined();
			expect(env.FORCE_COLOR).toBe('0');
			expect(env.DEBUG_COLORS).toBe('0');
			expect(env.EXAMPLE).toBe('value');
		} finally {
			if (previousNoColor === undefined) {
				delete process.env.NO_COLOR;
			} else {
				process.env.NO_COLOR = previousNoColor;
			}
		}
	});

	it('strips inherited PWDEBUG so Playwright cannot force headed inspector mode', () => {
		const previousPwdebug = process.env.PWDEBUG;
		const previousNpmConfig = process.env.npm_config_pwdebug;
		process.env.PWDEBUG = '1';
		process.env.npm_config_pwdebug = '1';

		try {
			const env = createPlaywrightSubprocessEnv({ EXAMPLE: 'value' });
			expect(env.PWDEBUG).toBeUndefined();
			expect(env.npm_config_pwdebug).toBeUndefined();
			expect(env.EXAMPLE).toBe('value');
			expect(process.env.PWDEBUG).toBe('1');
		} finally {
			if (previousPwdebug === undefined) {
				delete process.env.PWDEBUG;
			} else {
				process.env.PWDEBUG = previousPwdebug;
			}

			if (previousNpmConfig === undefined) {
				delete process.env.npm_config_pwdebug;
			} else {
				process.env.npm_config_pwdebug = previousNpmConfig;
			}
		}
	});

	it('keeps the Playwright inspector only when --debug is on the command line', () => {
		expect(shouldKeepPlaywrightInspector(['node', 'playwright', 'test'])).toBe(false);
		expect(shouldKeepPlaywrightInspector(['node', 'playwright', 'test', '--headed'])).toBe(false);
		expect(shouldKeepPlaywrightInspector(['node', 'playwright', 'test', '--debug'])).toBe(true);
		expect(shouldKeepPlaywrightInspector(['node', 'playwright', 'test', '--debug=inspector'])).toBe(true);
	});

	it('stripInheritedPlaywrightInspectorEnv removes inspector keys from the given env', () => {
		const env = stripInheritedPlaywrightInspectorEnv({
			PWDEBUG: 'console',
			npm_config_pwdebug: '1',
			npm_package_config_pwdebug: 'true',
			KEEP: 'yes',
		});

		expect(env.PWDEBUG).toBeUndefined();
		expect(env.npm_config_pwdebug).toBeUndefined();
		expect(env.npm_package_config_pwdebug).toBeUndefined();
		expect(env.KEEP).toBe('yes');
	});
});
