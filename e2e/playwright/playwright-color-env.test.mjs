import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	configurePlaywrightColorEnv,
	createPlaywrightSubprocessEnv,
	shouldDisablePlaywrightColors,
} from './playwright-color-env.mjs';

test('shouldDisablePlaywrightColors honors NO_COLOR, CI, and Playwright disable flags', () => {
	assert.equal(shouldDisablePlaywrightColors({ NO_COLOR: '1' }), true);
	assert.equal(shouldDisablePlaywrightColors({ CI: 'true' }), true);
	assert.equal(shouldDisablePlaywrightColors({ FORCE_COLOR: '0' }), true);
	assert.equal(shouldDisablePlaywrightColors({ DEBUG_COLORS: 'false' }), true);
	assert.equal(shouldDisablePlaywrightColors({}), false);
});

test('configurePlaywrightColorEnv maps no-color intent to Playwright env vars', () => {
	const env = configurePlaywrightColorEnv({
		NO_COLOR: '1',
		FORCE_COLOR: '1',
		DEBUG_COLORS: '1',
		EXAMPLE: 'value',
	});

	assert.equal(env.NO_COLOR, undefined);
	assert.equal(env.FORCE_COLOR, '0');
	assert.equal(env.DEBUG_COLORS, '0');
	assert.equal(env.EXAMPLE, 'value');
});

test('createPlaywrightSubprocessEnv applies overrides after color normalization', () => {
	const previousNoColor = process.env.NO_COLOR;
	process.env.NO_COLOR = '1';

	try {
		const env = createPlaywrightSubprocessEnv({ EXAMPLE: 'value' });
		assert.equal(env.NO_COLOR, undefined);
		assert.equal(env.FORCE_COLOR, '0');
		assert.equal(env.DEBUG_COLORS, '0');
		assert.equal(env.EXAMPLE, 'value');
	} finally {
		if (previousNoColor === undefined) {
			delete process.env.NO_COLOR;
		} else {
			process.env.NO_COLOR = previousNoColor;
		}
	}
});
