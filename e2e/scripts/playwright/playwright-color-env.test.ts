import { describe, expect, it, vi } from 'vitest';
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
		vi.stubEnv('NO_COLOR', '1');

		const env = createPlaywrightSubprocessEnv({ EXAMPLE: 'value' });
		expect(env.NO_COLOR).toBeUndefined();
		expect(env.FORCE_COLOR).toBe('0');
		expect(env.DEBUG_COLORS).toBe('0');
		expect(env.EXAMPLE).toBe('value');
	});

	it('strips inherited PWDEBUG so Playwright cannot force headed inspector mode', () => {
		vi.stubEnv('PWDEBUG', '1');
		vi.stubEnv('npm_config_pwdebug', '1');

		const env = createPlaywrightSubprocessEnv({ EXAMPLE: 'value' });
		expect(env.PWDEBUG).toBeUndefined();
		expect(env.npm_config_pwdebug).toBeUndefined();
		expect(env.EXAMPLE).toBe('value');
		expect(process.env.PWDEBUG).toBe('1');
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
