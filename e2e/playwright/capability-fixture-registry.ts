import type { FixtureModule } from './define-fixture.ts';
import type { IsolatedFixtureModule } from './define-isolated-fixture.ts';
import browserRouterFixture from '../fixtures/browser-router/fixture.e2e.ts';
import cacheFixture from '../fixtures/cache/fixture.e2e.ts';
import coreHmrFixture from '../fixtures/core-hmr/fixture.e2e.ts';
import crossIntegrationFixture from '../fixtures/cross-integration/fixture.e2e.ts';
import docsFixture from '../fixtures/docs/fixture.e2e.ts';
import reactFixture from '../fixtures/react/fixture.e2e.ts';
import reactRouterFixture from '../fixtures/react-router/fixture.e2e.ts';

/** Register capability fixtures here after adding `e2e/fixtures/<block>/fixture.e2e.ts`. */
export const capabilityFixtures: FixtureModule[] = [
	browserRouterFixture,
	cacheFixture,
	coreHmrFixture,
	docsFixture,
	reactFixture,
	reactRouterFixture,
];

export const isolatedFixtures: IsolatedFixtureModule[] = [crossIntegrationFixture];
