import type { FixtureModule } from './define-fixture.ts';
import { capabilityFixtures } from './capability-fixture-registry.ts';

export function loadCapabilityFixtures(): FixtureModule[] {
	return [...capabilityFixtures].sort((left, right) => left.block.localeCompare(right.block));
}
