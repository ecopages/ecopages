import { describe, expect, it } from 'vitest';
import { defineCrossIntegrationFixture } from './define-isolated-fixture.ts';

describe('defineCrossIntegrationFixture', () => {
	const fixture = defineCrossIntegrationFixture({});
	const [project] = fixture.projects;

	it('runs the HMR project on Node, on a per-worker copy of kitchen-sink', () => {
		expect(fixture.projects.map((candidate) => candidate.name)).toEqual(['cross-integration-hmr-node-e2e']);
		expect(fixture.webServers).toEqual([]);
		expect(project.use?.appOptions).toMatchObject({ source: 'playground/kitchen-sink' });
		expect(project.use?.appOptions?.runtime).toBeUndefined();
	});

	it('runs a file on one worker and lets different files run on different workers', () => {
		expect(project.workers).toBeUndefined();
		expect(project.fullyParallel).toBe(false);
	});
});
