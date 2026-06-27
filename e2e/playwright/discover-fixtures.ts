import type { FixtureModule } from './define-fixture.ts';
import type { IsolatedFixtureModule } from './define-isolated-fixture.ts';
import { capabilityFixtures, isolatedFixtures } from './capability-fixture-registry.ts';

export function loadCapabilityFixtures(): FixtureModule[] {
	return [...capabilityFixtures].sort((left, right) =>
		getFixtureBlock(left).localeCompare(getFixtureBlock(right)),
	);
}

export function loadIsolatedFixtures(): IsolatedFixtureModule[] {
	return [...isolatedFixtures];
}

function getFixtureBlock(fixture: FixtureModule): string {
	return 'block' in fixture.definition ? fixture.definition.block : 'external';
}
