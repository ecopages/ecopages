import { describe, expect, it } from 'vitest';
import { defineCrossIntegrationFixture } from './define-isolated-fixture.ts';

describe('defineCrossIntegrationFixture', () => {
	const fixture = defineCrossIntegrationFixture('/repo', {}, { reuseExistingServer: false });

	it('keeps one worker on mutating HMR projects', () => {
		expect(fixture.projects.map((project) => project.workers)).toEqual([1, 1, 1]);
	});

	it('collects app-entry restart specs only on the Vite host', () => {
		const byName = Object.fromEntries(fixture.projects.map((project) => [project.name, project.testIgnore]));
		expect(byName['cross-integration-hmr-e2e']).toBe('**/app-entry-restart-hmr.test.e2e.ts');
		expect(byName['cross-integration-hmr-node-e2e']).toBe('**/app-entry-restart-hmr.test.e2e.ts');
		expect(byName['cross-integration-hmr-vite-e2e']).toBeUndefined();
	});
});
