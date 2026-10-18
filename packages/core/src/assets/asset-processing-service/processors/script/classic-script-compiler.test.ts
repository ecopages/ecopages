import assert from 'node:assert/strict';
import { test } from 'vitest';
import { compileClassicScript } from './classic-script-compiler.ts';

test('compileClassicScript recompiles a file whose source changed and keeps the cached transform otherwise', () => {
	const filepath = '/app/src/pages/legacy.ts';

	const first = compileClassicScript(filepath, 'var version: number = 1;', { minify: false });
	assert.ok('code' in first && first.code.includes('version = 1'));

	const same = compileClassicScript(filepath, 'var version: number = 1;', { minify: true });
	assert.ok('code' in same && same.code.includes('version=1'));

	const changed = compileClassicScript(filepath, 'var version: number = 2;', { minify: false });
	assert.ok('code' in changed && changed.code.includes('version = 2'));

	const broken = compileClassicScript(filepath, 'export var version = 3;', { minify: false });
	assert.ok('problem' in broken && broken.problem.needsModule);
});
