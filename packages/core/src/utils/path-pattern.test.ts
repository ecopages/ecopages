import { describe, expect, test } from 'vitest';
import { matchPathPattern, matchesAnyPathPattern } from './path-pattern.ts';

describe('matchPathPattern', () => {
	test('matches exact pathnames', () => {
		expect(matchPathPattern('/admin', '/admin')).toBe(true);
		expect(matchPathPattern('/admin/', '/admin')).toBe(true);
		expect(matchPathPattern('/admin/users', '/admin')).toBe(false);
	});

	test('matches prefix/** patterns including the prefix itself', () => {
		expect(matchPathPattern('/admin', '/admin/**')).toBe(true);
		expect(matchPathPattern('/admin/users', '/admin/**')).toBe(true);
		expect(matchPathPattern('/admin/users/edit', '/admin/**')).toBe(true);
		expect(matchPathPattern('/administrator', '/admin/**')).toBe(false);
		expect(matchPathPattern('/blog', '/admin/**')).toBe(false);
	});

	test('/** matches every pathname', () => {
		expect(matchPathPattern('/', '/**')).toBe(true);
		expect(matchPathPattern('/anything', '/**')).toBe(true);
	});
});

describe('matchesAnyPathPattern', () => {
	test('returns true when any pattern matches', () => {
		expect(matchesAnyPathPattern('/preview/draft', ['/admin/**', '/preview/**'])).toBe(true);
		expect(matchesAnyPathPattern('/blog', ['/admin/**', '/preview/**'])).toBe(false);
	});
});
