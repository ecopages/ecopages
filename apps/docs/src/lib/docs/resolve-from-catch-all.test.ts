import { expect, test } from 'vitest';
import { parseDocsCatchAllSegments } from './resolve-from-catch-all';

test('parseDocsCatchAllSegments normalizes string[] slug params', () => {
	expect(parseDocsCatchAllSegments(['getting-started', 'introduction'])).toEqual(['getting-started', 'introduction']);
});

test('parseDocsCatchAllSegments accepts joined slug strings', () => {
	expect(parseDocsCatchAllSegments('getting-started/introduction')).toEqual(['getting-started', 'introduction']);
});

test('parseDocsCatchAllSegments rejects missing segments', () => {
	expect(() => parseDocsCatchAllSegments(['introduction'])).toThrow(/Invalid docs slug/);
});

test('parseDocsCatchAllSegments rejects empty slug params', () => {
	expect(() => parseDocsCatchAllSegments('')).toThrow(/Invalid docs slug/);
});
