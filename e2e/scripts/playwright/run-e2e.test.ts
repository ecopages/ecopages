import { describe, expect, it } from 'vitest';
import {
	assertKitchenSinkWorkspaceIsolation,
	buildKitchenSinkBatches,
	buildProjectArgs,
	cleanupE2eTempDir,
	defaultProjectBatches,
	fixtureProjectBatches,
	getKitchenSinkProjectWorkspaces,
	getKitchenSinkWorkspaceForProject,
	getSelectedProjects,
	hasInteractivePassThroughFlags,
	hasKitchenSinkOnlyFlag,
	isKitchenSinkBatch,
	kitchenSinkCapabilityGroups,
	partitionBatches,
	resolveKitchenSinkCapabilityGroups,
	resolveProjectBatches,
	stripKitchenSinkOrchestratorFlags,
} from './run-e2e.mjs';

describe('run-e2e wrapper planning', () => {
	it('keeps list-mode selections inside wrapper planning', () => {
		expect(hasInteractivePassThroughFlags(['--list'])).toBe(false);
		expect(hasInteractivePassThroughFlags(['--ui'])).toBe(true);
	});

	it('extracts selected projects from playwright arguments', () => {
		expect(getSelectedProjects(['--project', 'kitchen-sink-node-e2e', '--project=docs-e2e'])).toEqual([
			'kitchen-sink-node-e2e',
			'docs-e2e',
		]);
	});

	it('cleans the shared e2e temp directory without throwing', () => {
		expect(() => cleanupE2eTempDir()).not.toThrow();
	});

	it('builds repeated playwright --project flags for a batch', () => {
		expect(buildProjectArgs(['cache-e2e', 'docs-e2e'])).toEqual([
			'--project',
			'cache-e2e',
			'--project',
			'docs-e2e',
		]);
	});

	it('groups kitchen-sink projects by capability instead of one long serial list', () => {
		expect(kitchenSinkCapabilityGroups).toEqual([
			{
				name: 'kitchen-sink-preview',
				projects: ['kitchen-sink-bun-preview-e2e', 'kitchen-sink-node-preview-e2e'],
				concurrency: expect.any(Number),
			},
			{
				name: 'kitchen-sink-dev',
				projects: [
					'kitchen-sink-bun-e2e',
					'kitchen-sink-node-e2e',
					'kitchen-sink-vite-node-e2e',
					'kitchen-sink-vite-bun-e2e',
				],
				concurrency: expect.any(Number),
			},
			{
				name: 'kitchen-sink-hmr',
				projects: [
					'kitchen-sink-bun-hmr-e2e',
					'kitchen-sink-node-hmr-e2e',
					'kitchen-sink-vite-node-hmr-e2e',
					'kitchen-sink-vite-bun-hmr-e2e',
				],
				concurrency: 1,
			},
		]);
	});

	it('assigns each kitchen-sink project its own batch entry', () => {
		const kitchenSinkBatches = buildKitchenSinkBatches();

		expect(kitchenSinkBatches).toHaveLength(10);
		expect(new Set(kitchenSinkBatches.map((batch) => batch[0])).size).toBe(10);
	});

	it('keeps fixture batches separate from kitchen-sink batches', () => {
		const { batches } = resolveProjectBatches([]);
		const { fixtureBatches, kitchenSinkBatches } = partitionBatches(batches);

		expect(fixtureBatches).toEqual(fixtureProjectBatches);
		expect(fixtureBatches).toHaveLength(3);
		expect(kitchenSinkBatches).toHaveLength(10);
		expect(batches).toEqual(defaultProjectBatches);
		expect(isKitchenSinkBatch(['kitchen-sink-bun-e2e'])).toBe(true);
		expect(isKitchenSinkBatch(['docs-e2e'])).toBe(false);
	});

	it('supports kitchen-sink-only mode without fixture batches', () => {
		expect(hasKitchenSinkOnlyFlag(['--kitchen-sink-only', '--grep', '@stress'])).toBe(true);
		expect(stripKitchenSinkOrchestratorFlags(['--kitchen-sink-only', '--grep', '@stress'])).toEqual([
			'--grep',
			'@stress',
		]);

		const { batches, playwrightArgs, kitchenSinkOnly, kitchenSinkGroups } = resolveProjectBatches([
			'--kitchen-sink-only',
			'--grep',
			'@stress',
		]);

		expect(kitchenSinkOnly).toBe(true);
		expect(playwrightArgs).toEqual(['--grep', '@stress']);
		expect(kitchenSinkGroups).toEqual([kitchenSinkCapabilityGroups[1]]);
		expect(batches).toHaveLength(4);
		expect(batches.every((batch) => isKitchenSinkBatch(batch))).toBe(true);
	});

	it('maps behavior grep tags to kitchen-sink capability groups', () => {
		expect(resolveKitchenSinkCapabilityGroups(['--grep', '@preview'])).toEqual([kitchenSinkCapabilityGroups[0]]);
		expect(resolveKitchenSinkCapabilityGroups(['--grep', '@hmr'])).toEqual([kitchenSinkCapabilityGroups[2]]);
		expect(resolveKitchenSinkCapabilityGroups(['--kitchen-sink-capability=dev'])).toEqual([
			kitchenSinkCapabilityGroups[1],
		]);
	});

	it('gives each kitchen-sink capability group a positive concurrency cap', () => {
		for (const group of kitchenSinkCapabilityGroups) {
			expect(group.concurrency).toBeGreaterThan(0);
		}
	});

	it('defaults kitchen-sink dev batch concurrency to min(2, server cap)', () => {
		expect(kitchenSinkCapabilityGroups[1]?.concurrency).toBeLessThanOrEqual(2);
		expect(kitchenSinkCapabilityGroups[1]?.concurrency).toBeGreaterThan(0);
	});

	it('keeps kitchen-sink hmr batch concurrency serial by default', () => {
		expect(kitchenSinkCapabilityGroups[2]?.concurrency).toBe(1);
	});

	it('maps each kitchen-sink HMR project to a unique workspace while sharing read-only workspaces', () => {
		expect(getKitchenSinkWorkspaceForProject('kitchen-sink-bun-e2e')).toBe('kitchen-sink-shared');
		expect(getKitchenSinkWorkspaceForProject('kitchen-sink-bun-preview-e2e')).toBe('kitchen-sink-shared');
		expect(getKitchenSinkWorkspaceForProject('kitchen-sink-bun-hmr-e2e')).toBe('kitchen-sink-bun-hmr');

		const workspaces = assertKitchenSinkWorkspaceIsolation();
		expect(Object.keys(workspaces)).toHaveLength(10);
		expect(new Set(Object.values(workspaces)).size).toBe(5);
		expect(getKitchenSinkProjectWorkspaces()).toEqual(workspaces);
	});
});
