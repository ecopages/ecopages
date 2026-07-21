import { describe, expect, it } from 'vitest';
import { groupA11yIssues } from './a11y-issue-groups.ts';
import type { A11yIssueView } from './run-a11y-checks.ts';

function issue(overrides: Partial<A11yIssueView> & Pick<A11yIssueView, 'domPath'>): A11yIssueView {
	return {
		id: 'img-alt',
		message: 'Image is missing alt text',
		severity: 'error',
		source: 'builtin',
		targetSelector: 'img',
		matchIndex: 0,
		...overrides,
	};
}

describe('groupA11yIssues', () => {
	it('groups rows that share the same rule and message', () => {
		const groups = groupA11yIssues([
			issue({ domPath: [1, 0], matchIndex: 0 }),
			issue({ domPath: [1, 1], matchIndex: 1 }),
			issue({
				id: 'form-label',
				message: 'Form control is missing an accessible label',
				domPath: [2, 0],
			}),
		]);

		expect(groups).toHaveLength(2);
		expect(groups[0]?.nodes).toHaveLength(2);
		expect(groups[1]?.nodes).toHaveLength(1);
	});
});
