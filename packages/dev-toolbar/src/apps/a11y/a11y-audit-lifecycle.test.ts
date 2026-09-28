import { describe, expect, it } from 'vitest';
import { toA11yBadge } from './a11y-badge.ts';
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
	it('derives dock badges from issue views', () => {
		expect(toA11yBadge([])).toBeUndefined();
		expect(toA11yBadge([sampleIssue])).toEqual({ count: 1, severity: 'error' });
	});
});
