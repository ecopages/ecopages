import { expect, test } from 'vitest';
import { HttpError } from '@ecopages/core/errors';
import { parseDocsCatchAllSegments } from './resolve-from-catch-all';

test('parseDocsCatchAllSegments normalizes string[] slug params', () => {
	expect(parseDocsCatchAllSegments(['getting-started', 'introduction'])).toEqual(['getting-started', 'introduction']);
});

test('parseDocsCatchAllSegments accepts joined slug strings', () => {
	expect(parseDocsCatchAllSegments('getting-started/introduction')).toEqual(['getting-started', 'introduction']);
});

test('parseDocsCatchAllSegments rejects missing segments with NotFound', () => {
	try {
		parseDocsCatchAllSegments(['introduction']);
		expect.unreachable();
	} catch (error) {
		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).status).toBe(404);
		expect((error as HttpError).message).toMatch(/Invalid docs slug/);
	}
});

test('parseDocsCatchAllSegments rejects empty slug params with NotFound', () => {
	try {
		parseDocsCatchAllSegments('');
		expect.unreachable();
	} catch (error) {
		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).status).toBe(404);
	}
});
