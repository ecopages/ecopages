import type { DevToolbarBadge } from '../../api/types.ts';
import type { A11yIssueView } from './run-a11y-checks.ts';

export function toA11yBadge(issues: A11yIssueView[]): DevToolbarBadge | undefined {
	if (issues.length === 0) {
		return undefined;
	}

	const hasError = issues.some((issue) => issue.severity === 'error');
	return {
		count: issues.length,
		severity: hasError ? 'error' : 'warning',
	};
}
