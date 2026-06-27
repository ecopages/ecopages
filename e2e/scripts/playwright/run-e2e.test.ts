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

	it('defines one wave per registered project (sequential single-server waves)', () => {
		expect(FULL_GATE_WAVES).toHaveLength(14);
		expect(FULL_GATE_WAVES.every((wave) => wave.projects.length === 1)).toBe(true);
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
		expect(batches).toHaveLength(14);
		expect(batches).toEqual(FULL_GATE_WAVES.map((wave) => wave.projects));
	});

	it('keeps static projects separate from dev projects', () => {
		const staticProjects = [
			'browser-router-e2e',
			'cache-e2e',
			'core-hmr-static-e2e',
			'docs-e2e',
			'react-router-e2e',
			'react-router-persist-layouts-e2e',
			'cross-integration-preview-e2e',
		];
		const devProjects = ['core-hmr-dev-e2e', 'react-router-persist-layouts-dev-e2e'];

		for (const staticProject of staticProjects) {
			const staticWave = FULL_GATE_WAVES.find((wave) => wave.projects.includes(staticProject));
			expect(staticWave?.projects).toEqual([staticProject]);
		}

		for (const devProject of devProjects) {
			const devWave = FULL_GATE_WAVES.find((wave) => wave.projects.includes(devProject));
			expect(devWave?.projects).toEqual([devProject]);
		}
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
