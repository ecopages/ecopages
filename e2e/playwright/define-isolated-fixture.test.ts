import { describe, expect, it } from 'vitest';
import { defineCrossIntegrationFixture } from './define-isolated-fixture.ts';

describe('defineCrossIntegrationFixture', () => {
	const fixture = defineCrossIntegrationFixture('/repo', {}, { reuseExistingServer: false });

	it('keeps one worker on mutating HMR projects', () => {
		expect(fixture.projects.map((project) => project.workers)).toEqual([1, 1]);
	});
});
