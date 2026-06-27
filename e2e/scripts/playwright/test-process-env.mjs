/**
 * Subprocess env for e2e runners.
 *
 * Playwright workers set FORCE_COLOR; inherited NO_COLOR triggers a Node warning
 * on every worker spawn. Drop NO_COLOR so test output stays clean.
 */
export function createTestSubprocessEnv(overrides = {}) {
	const env = { ...process.env, ...overrides };
	delete env.NO_COLOR;
	return env;
}
