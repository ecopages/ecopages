import { describe, expect, it } from 'vitest';
import { defineCrossIntegrationFixture } from './define-isolated-fixture.ts';

describe('defineCrossIntegrationFixture', () => {
	const fixture = defineCrossIntegrationFixture('/repo', {}, { reuseExistingServer: false });

	it('keeps one worker on the mutating HMR project', () => {
		expect(fixture.projects.map((project) => project.workers)).toEqual([1]);
	});

	it('runs the HMR project on Node', () => {
		expect(fixture.batchProjects).toEqual(['cross-integration-hmr-node-e2e']);
		expect(fixture.webServers[0].command).toContain('--runtime node');
	});
});
