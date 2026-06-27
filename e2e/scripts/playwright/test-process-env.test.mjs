import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestSubprocessEnv } from './test-process-env.mjs';

test('createTestSubprocessEnv drops NO_COLOR to avoid FORCE_COLOR conflict warnings', () => {
	const previousNoColor = process.env.NO_COLOR;
	const previousForceColor = process.env.FORCE_COLOR;

	process.env.NO_COLOR = '1';
	process.env.FORCE_COLOR = '1';

	try {
		const env = createTestSubprocessEnv({ EXAMPLE: 'value' });
		assert.equal(env.NO_COLOR, undefined);
		assert.equal(env.FORCE_COLOR, '1');
		assert.equal(env.EXAMPLE, 'value');
	} finally {
		if (previousNoColor === undefined) {
			delete process.env.NO_COLOR;
		} else {
			process.env.NO_COLOR = previousNoColor;
		}

		if (previousForceColor === undefined) {
			delete process.env.FORCE_COLOR;
		} else {
			process.env.FORCE_COLOR = previousForceColor;
		}
	}
});
