import { describe, expect, it } from 'vitest';
import { badgesEqual } from './badges.ts';

describe('badgesEqual', () => {
	it('treats identical references as equal', () => {
		const badge = { count: 2, severity: 'warning' as const };
		expect(badgesEqual(badge, badge)).toBe(true);
	});

	it('treats matching values as equal', () => {
		expect(badgesEqual({ count: 3, severity: 'error' }, { count: 3, severity: 'error' })).toBe(true);
	});

	it('treats undefined pairs as equal', () => {
		expect(badgesEqual(undefined, undefined)).toBe(true);
	});

	it('treats changed counts or severity as unequal', () => {
		expect(badgesEqual({ count: 1, severity: 'warning' }, { count: 2, severity: 'warning' })).toBe(false);
		expect(badgesEqual({ count: 1, severity: 'warning' }, { count: 1, severity: 'error' })).toBe(false);
		expect(badgesEqual({ count: 1, severity: 'warning' }, undefined)).toBe(false);
	});
});
