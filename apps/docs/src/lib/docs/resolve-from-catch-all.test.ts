import { expect, test } from 'vitest';
import { parseDocsCatchAllSegments, resolveFromCatchAll } from './resolve-from-catch-all';

test('resolveFromCatchAll maps string[] slug to section and page slug', () => {
	expect(resolveFromCatchAll(['getting-started', 'introduction'])).toEqual({
		section: 'getting-started',
		slug: 'introduction',
	});
});

test('resolveFromCatchAll accepts joined slug strings', () => {
	expect(resolveFromCatchAll('getting-started/introduction')).toEqual({
		section: 'getting-started',
		slug: 'introduction',
	});
});

test('resolveFromCatchAll rejects missing segments', () => {
	expect(() => resolveFromCatchAll(['introduction'])).toThrow(/Invalid docs slug/);
});

test('parseDocsCatchAllSegments rejects empty slug params', () => {
	expect(() => parseDocsCatchAllSegments('')).toThrow(/Invalid docs slug/);
});
