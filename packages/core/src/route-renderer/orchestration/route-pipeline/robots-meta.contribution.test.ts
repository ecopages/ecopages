import { describe, expect, test } from 'vitest';
import { buildRobotsMetaContribution, formatRobotsMetaContent } from './robots-meta.contribution.ts';

describe('formatRobotsMetaContent', () => {
	test('returns undefined for omitted or default robots', () => {
		expect(formatRobotsMetaContent(undefined)).toBeUndefined();
		expect(formatRobotsMetaContent({})).toBeUndefined();
		expect(formatRobotsMetaContent({ index: true, follow: true })).toBeUndefined();
	});

	test('formats noindex and nofollow overrides', () => {
		expect(formatRobotsMetaContent({ index: false })).toBe('noindex');
		expect(formatRobotsMetaContent({ follow: false })).toBe('nofollow');
		expect(formatRobotsMetaContent({ index: false, follow: false })).toBe('noindex, nofollow');
		expect(formatRobotsMetaContent({ index: false, follow: false, nocache: true })).toBe(
			'noindex, nofollow, nocache',
		);
	});
});

describe('buildRobotsMetaContribution', () => {
	test('returns undefined when no meta tag is needed', () => {
		expect(buildRobotsMetaContribution({})).toBeUndefined();
	});

	test('returns a head-append contribution with escaped content', () => {
		expect(buildRobotsMetaContribution({ robots: { index: false, follow: false } })).toEqual({
			placement: 'head-append',
			html: '<meta name="robots" content="noindex, nofollow">',
		});
	});
});
