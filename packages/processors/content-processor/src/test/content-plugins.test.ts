import { describe, expect, test } from 'vitest';
import { parseCollectionName, resolveCollectionPath } from '../content-plugins.ts';

describe('content-plugins', () => {
	test('parseCollectionName handles full and rolldown-split specifiers', () => {
		expect(parseCollectionName('ecopages:content/docs')).toBe('docs');
		expect(parseCollectionName('content/docs')).toBe('docs');
		expect(parseCollectionName('ecopages:content/blog-posts')).toBe('blog-posts');
	});

	test('resolveCollectionPath returns cache module path', () => {
		const modules = {
			docs: '/tmp/.eco/cache/ecopages-content-processor/docs.ts',
		};

		expect(resolveCollectionPath('ecopages:content/docs', modules)).toBe(modules.docs);
		expect(resolveCollectionPath('content/docs', modules)).toBe(modules.docs);
		expect(resolveCollectionPath('ecopages:content/missing', modules)).toBeNull();
	});
});
