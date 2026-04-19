import { describe, expect, it } from 'vitest';
import { cleanupE2eTempDir, getSelectedProjects, hasInteractivePassThroughFlags } from './run-e2e.mjs';

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
});
