import { describe, expect, it } from 'vitest';
import { toA11yBadge } from './a11y-badge.ts';
import { clearAuditCache, readAuditCache, resetAuditCacheForTests, writeAuditCache } from './audit-cache.ts';
import type { A11yIssueView } from './run-a11y-checks.ts';

const sampleIssue: A11yIssueView = {
	id: 'img-alt',
	message: 'Image is missing alt text',
	severity: 'error',
	source: 'builtin',
	targetSelector: 'img',
	domPath: [1, 0],
	matchIndex: 0,
};

describe('a11y audit lifecycle', () => {
	it('stores serializable issue views instead of live elements', () => {
		resetAuditCacheForTests();
		const doc = { defaultView: { location: { href: 'https://example.test/page' } } } as Document;

		writeAuditCache(doc, [sampleIssue]);
		const cached = readAuditCache(doc);
		expect(cached).toEqual([sampleIssue]);
		expect(cached?.[0]).not.toHaveProperty('element');
	});

	it('clears cached views on route invalidation', () => {
		resetAuditCacheForTests();
		const doc = { defaultView: { location: { href: 'https://example.test/page' } } } as Document;

		writeAuditCache(doc, [sampleIssue]);
		clearAuditCache(doc);
		expect(readAuditCache(doc)).toBeUndefined();
	});

	it('derives dock badges from issue views', () => {
		expect(toA11yBadge([])).toBeUndefined();
		expect(toA11yBadge([sampleIssue])).toEqual({ count: 1, severity: 'error' });
	});
});
