import { describe, expect, it } from 'vitest';
import { isPathInside } from './path-containment.ts';

describe('isPathInside', () => {
	it.each([
		['/app/src/public/logo.svg', '/app/src/public', true],
		['/app/src/public', '/app/src/public', true],
		['/app/src/public/', '/app/src/public', true],
		['/app/src/public/logo.svg', '/app/src/public/', true],
		['/app/src/public/..config', '/app/src/public', true],
		['/app/src/public-api/client.ts', '/app/src/public', false],
		['/app/src/publicity.ts', '/app/src/public', false],
		['/app/src', '/app/src/public', false],
		['/app/src/public/../secret.ts', '/app/src/public', false],
	])('%s inside %s is %s', (filePath, directory, expected) => {
		expect(isPathInside(filePath, directory)).toBe(expected);
	});
});
