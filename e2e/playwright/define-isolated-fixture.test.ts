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

	it('keeps a file serial and sets no worker cap of its own', () => {
		expect(project.workers).toBeUndefined();
		expect(project.fullyParallel).toBe(false);
	});
});
