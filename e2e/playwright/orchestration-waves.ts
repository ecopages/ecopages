/**
 * Five sequential orchestration waves — one Playwright subprocess each.
 *
 * Waves replace per-fixture `batchGroups` + flat cross-integration batches.
 * The orchestrator (`run-e2e.ts`) runs these sequentially; in-wave parallelism
 * is handled by Playwright's per-project `workers` setting.
 *
 * `assertWaveCoverage` is the drift guard: every registered project must appear
 * in exactly one wave. Adding a fixture without a wave fails loudly.
 */
import { capabilityFixtures, isolatedFixtures } from './capability-fixture-registry.ts';

export type Wave = {
	name: string;
	projects: string[];
};

export const FULL_GATE_WAVES: Wave[] = [
	{
		name: 'browser-router',
		projects: ['browser-router-e2e'],
	},
	{
		name: 'cache',
		projects: ['cache-e2e'],
	},
	{
		name: 'core-hmr-static',
		projects: ['core-hmr-static-e2e'],
	},
	{
		name: 'docs',
		projects: ['docs-e2e'],
	},
	{
		name: 'react-router',
		projects: ['react-router-e2e'],
	},
	{
		name: 'react-router-persist-layouts',
		projects: ['react-router-persist-layouts-e2e'],
	},
	{
		name: 'cross-integration-preview',
		projects: ['cross-integration-preview-e2e'],
	},
	{
		name: 'core-hmr-dev',
		projects: ['core-hmr-dev-e2e'],
	},
	{
		name: 'core-hmr-postcss-dev',
		projects: ['core-hmr-postcss-dev-e2e'],
	},
	{
		name: 'react-dev',
		projects: ['react-dev-e2e'],
	},
	{
		name: 'react-router-persist-layouts-dev',
		projects: ['react-router-persist-layouts-dev-e2e'],
	},
	{
		name: 'cross-integration-dev',
		projects: ['cross-integration-dev-e2e'],
	},
	{
		name: 'cross-integration-vite-dev',
		projects: ['cross-integration-vite-dev-e2e'],
	},
	{
		name: 'cross-integration-hmr',
		projects: ['cross-integration-hmr-e2e'],
	},
];

export function getFullGateBatches(): string[][] {
	return FULL_GATE_WAVES.map((wave) => wave.projects);
}

export function getAllRegisteredProjectNames(): string[] {
	return [
		...capabilityFixtures.flatMap((fixture) => fixture.batchProjects),
		...isolatedFixtures.flatMap((fixture) => fixture.batchProjects),
	];
}

export function assertWaveCoverage(): void {
	const registered = new Set(getAllRegisteredProjectNames());
	const seen = new Set<string>();

	for (const project of FULL_GATE_WAVES.flatMap((wave) => wave.projects)) {
		if (!registered.has(project)) {
			throw new Error(`Wave references unregistered project: ${project}`);
		}

		if (seen.has(project)) {
			throw new Error(`Project appears in multiple waves: ${project}`);
		}

		seen.add(project);
	}

	for (const project of registered) {
		if (!seen.has(project)) {
			throw new Error(`Registered project missing from waves: ${project}`);
		}
	}
}
