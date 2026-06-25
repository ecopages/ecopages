/**
 * Opt-in Vitest suites gated by env vars.
 *
 * Add entries here when a test is too slow or needs special setup and should not
 * run on every `pnpm test:vitest` invocation. Pair each suite with a package.json
 * script that sets the env var to `1`.
 *
 * @see e2e/README.md — Vitest opt-in suites
 */
export type OptionalVitestSuite = {
	env: string;
	includes: string[];
};

export const optionalVitestSuites: OptionalVitestSuite[] = [
	{
		env: 'ECOPAGES_TEST_STATIC_BUILD_PARITY',
		includes: ['playground/kitchen-sink/bench/static-build-unified-graph-parity.test.ts'],
	},
];

export function getOptionalVitestIncludes(): string[] {
	return optionalVitestSuites.filter((suite) => process.env[suite.env] === '1').flatMap((suite) => suite.includes);
}
