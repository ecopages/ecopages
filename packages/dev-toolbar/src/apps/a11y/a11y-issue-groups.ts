import type { A11yIssueView } from './run-a11y-checks.ts';

export type A11yIssueGroup = {
	id: string;
	message: string;
	severity: A11yIssueView['severity'];
	source: A11yIssueView['source'];
	nodes: A11yIssueView[];
};

function groupKey(issue: A11yIssueView): string {
	return `${issue.source}:${issue.id}:${issue.message}`;
}

/**
 * Groups audit rows that share the same rule and message so multi-node issues can be stepped through.
 */
export function groupA11yIssues(issues: A11yIssueView[]): A11yIssueGroup[] {
	const groups: A11yIssueGroup[] = [];
	const indexByKey = new Map<string, number>();

	for (const issue of issues) {
		const key = groupKey(issue);
		const existingIndex = indexByKey.get(key);

		if (existingIndex === undefined) {
			indexByKey.set(key, groups.length);
			groups.push({
				id: issue.id,
				message: issue.message,
				severity: issue.severity,
				source: issue.source,
				nodes: [issue],
			});
			continue;
		}

		groups[existingIndex]?.nodes.push(issue);
	}

	return groups;
}
