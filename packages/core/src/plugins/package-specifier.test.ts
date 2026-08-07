import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isSubpathOfPackageRoot, toPackageRootSpecifier } from './package-specifier.ts';

test('toPackageRootSpecifier normalizes scoped and unscoped subpaths', () => {
	assert.equal(toPackageRootSpecifier('@acme/ui'), '@acme/ui');
	assert.equal(toPackageRootSpecifier('@acme/ui/button'), '@acme/ui');
	assert.equal(toPackageRootSpecifier('lodash/debounce'), 'lodash');
	assert.equal(toPackageRootSpecifier('./local'), './local');
	assert.equal(toPackageRootSpecifier('node:fs'), 'node:fs');
});

test('isSubpathOfPackageRoot identifies package subpaths only', () => {
	assert.equal(isSubpathOfPackageRoot('@acme/ui/button', '@acme/ui'), true);
	assert.equal(isSubpathOfPackageRoot('@acme/ui', '@acme/ui'), false);
	assert.equal(isSubpathOfPackageRoot('react-dom/client', 'react'), false);
});
