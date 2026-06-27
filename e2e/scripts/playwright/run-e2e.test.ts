import { describe, expect, it } from 'vitest';
import {
	FULL_GATE_WAVES,
	assertWaveCoverage,
	getAllRegisteredProjectNames,
	getFullGateBatches,
} from '../../playwright/orchestration-waves.ts';
import {
	buildProjectArgs,
	cleanupE2eTempDir,
	getSelectedProjects,
	hasInteractivePassThroughFlags,
	stripBatchIncompatibleFlags,
} from './run-e2e.ts';
import { createCrossIntegrationProjects } from '../../playwright/define-isolated-fixture.ts';
import { getDefaultWorkerCount } from '../../playwright/workers.ts';

describe('run-e2e wave orchestration', () => {
	it('extracts selected projects from playwright arguments', () => {
		expect(getSelectedProjects(['--project', 'cross-integration-dev-e2e', '--project=docs-e2e'])).toEqual([
			'cross-integration-dev-e2e',
			'docs-e2e',
		]);
	});

	it('builds repeated playwright --project flags for a batch', () => {
		expect(buildProjectArgs(['cache-e2e', 'docs-e2e'])).toEqual([
			'--project',
			'cache-e2e',
			'--project',
			'docs-e2e',
		]);
	});

	it('detects interactive pass-through flags', () => {
		expect(hasInteractivePassThroughFlags(['--list'])).toBe(false);
		expect(hasInteractivePassThroughFlags(['--ui'])).toBe(true);
	});

	it('strips --debug from batch args', () => {
		expect(stripBatchIncompatibleFlags(['--debug', '--grep', '@stress'])).toEqual(['--grep', '@stress']);
	});

	it('cleans the shared e2e temp directory without throwing', () => {
		expect(() => cleanupE2eTempDir()).not.toThrow();
	});

	it('defines exactly 5 sequential waves', () => {
		expect(FULL_GATE_WAVES).toHaveLength(5);
		expect(FULL_GATE_WAVES.map((wave) => wave.name)).toEqual([
			'static-wave',
			'core-hmr-dev',
			'fixture-dev',
			'cross-integration-dev',
			'cross-integration-hmr',
		]);
	});

	it('covers all 14 registered projects exactly once', () => {
		assertWaveCoverage();

		const waved = FULL_GATE_WAVES.flatMap((wave) => wave.projects);
		const registered = getAllRegisteredProjectNames();

		expect(waved).toHaveLength(14);
		expect(registered).toHaveLength(14);
		expect(new Set(waved).size).toBe(14);
		expect(new Set(registered).size).toBe(14);
	});

	it('getFullGateBatches returns one batch per wave', () => {
		const batches = getFullGateBatches();
		expect(batches).toHaveLength(5);
		expect(batches).toEqual(FULL_GATE_WAVES.map((wave) => wave.projects));
	});

	it('groups cross-integration dev and vite-dev in one wave', () => {
		const devWave = FULL_GATE_WAVES.find((wave) => wave.name === 'cross-integration-dev');
		expect(devWave?.projects).toEqual(['cross-integration-dev-e2e', 'cross-integration-vite-dev-e2e']);
	});

	it('keeps static-wave separate from dev waves', () => {
		const staticWave = FULL_GATE_WAVES.find((wave) => wave.name === 'static-wave');
		expect(staticWave?.projects).not.toContain('core-hmr-dev-e2e');
		expect(staticWave?.projects).not.toContain('react-router-persist-layouts-dev-e2e');
	});

	it('assigns HMR projects a unique workspace while sharing read-only workspaces', () => {
		const projects = createCrossIntegrationProjects(getDefaultWorkerCount());
		const hmrProjects = projects.filter((project) => project.name.includes('-hmr-'));
		const nonHmrProjects = projects.filter((project) => !project.name.includes('-hmr-'));

		expect(hmrProjects).toHaveLength(1);
		expect(nonHmrProjects).toHaveLength(3);

		const hmrWorkspaces = new Set(hmrProjects.map((project) => project.workspace));
		expect(hmrWorkspaces.size).toBe(1);

		const nonHmrWorkspaces = new Set(nonHmrProjects.map((project) => project.workspace));
		expect(nonHmrWorkspaces.size).toBe(1);

		for (const hmr of hmrProjects) {
			expect(nonHmrProjects.every((project) => project.workspace !== hmr.workspace)).toBe(true);
		}
	});
});
