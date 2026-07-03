/**
 * Playwright config env parsing shared by `playwright.config.ts`.
 *
 * When invoking `playwright test` directly, set `ECOPAGES_PLAYWRIGHT_PROJECTS`
 * (comma-separated) to limit which web servers start.
 */

/**
 * Project names from `ECOPAGES_PLAYWRIGHT_PROJECTS` (comma-separated).
 * An empty set means “no filter” — every configured project is eligible.
 */
export function getSelectedPlaywrightProjects(): Set<string> {
	return new Set(
		(process.env.ECOPAGES_PLAYWRIGHT_PROJECTS ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean),
	);
}

export function shouldReuseExistingTestServers(): boolean {
	return process.env.ECOPAGES_REUSE_TEST_SERVERS === 'true';
}

/**
 * Whether a web-server entry should be registered for the current run.
 *
 * When no project filter is active, every server is included. With a filter,
 * only servers that back at least one selected project are started — this keeps
 * `playwright test --project foo` from booting the full cross-integration matrix.
 */
export function includeWebServerForProjects(selectedProjects: Set<string>, serverProjects: string[]): boolean {
	return selectedProjects.size === 0 || serverProjects.some((project) => selectedProjects.has(project));
}
