import { describe, expect, it } from 'vitest';
import { isStaticAssetHref, recoverPendingNavigationHref } from './link-intent.ts';

describe('isStaticAssetHref', () => {
	it.each(['/skill.txt', '/skill/reference/full-stack.md', '/assets/logo.png'])(
		'treats %s as a static asset',
		(href) => {
			expect(isStaticAssetHref(href)).toBe(true);
		},
	);

	it.each(['/docs/getting-started/introduction', '/'])('treats %s as an application route', (href) => {
		expect(isStaticAssetHref(href)).toBe(false);
	});
});

describe('recoverPendingNavigationHref', () => {
	it('returns null for stale or missing pending intent state', () => {
		expect(recoverPendingNavigationHref(null, true, 10)).toBeNull();
		expect(recoverPendingNavigationHref({ href: '/fast', timestamp: 0 }, false, 10)).toBeNull();
		expect(recoverPendingNavigationHref({ href: '/fast', timestamp: 0 }, true, 2000, 1000)).toBeNull();
	});

	it('returns the captured href while a navigation is still in flight', () => {
		expect(recoverPendingNavigationHref({ href: '/fast', timestamp: 10 }, true, 20, 1000)).toBe('/fast');
	});
});
