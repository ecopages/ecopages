/** @jsxImportSource @ecopages/jsx */
import { describe, expect, it } from 'vitest';
import '@ecopages/radiant/server/install-ssr-runtime';
import { renderComponentToString } from '@ecopages/radiant/server/render-component';
import { renderControllerToString } from '@ecopages/radiant/server/render-controller';
import { radiantHydrationMarkupFixtures } from './ecopages-jsx-radiant-hydration.markup-fixtures.ts';
import {
	defineControllerComponent,
	defineCounterComponent,
	type ControllerHost,
} from './ecopages-jsx-radiant-hydration.test-shared.tsx';

describe('Radiant hydration SSR markup', () => {
	it.each(['elementHydrate', 'elementFallback'] as const)(
		'renders RadiantElement hydrate hosts with hydration markers (%s)',
		async (fixtureKey) => {
			const tagName = radiantHydrationMarkupFixtures.tagNames[fixtureKey];
			const Counter = defineCounterComponent(tagName);
			const markup = await renderComponentToString(Counter, {
				renderOptions: { mode: 'hydrate' },
			});

			expect(markup).toBe(radiantHydrationMarkupFixtures.markups[fixtureKey]);
			expect(markup).toContain('data-hydration');
			expect(markup).toContain('data-testid="counter"');
		},
	);

	it('renders RadiantController SSR hosts with controller metadata', async () => {
		const identifier = radiantHydrationMarkupFixtures.tagNames.controllerActivation;
		const TestCounterController = defineControllerComponent(identifier);
		const markup = await renderControllerToString(TestCounterController, {
			tagName: 'section',
			initialize(controllerInstance) {
				(controllerInstance.host as ControllerHost).count = 1;
			},
		});

		expect(markup).toBe(radiantHydrationMarkupFixtures.markups.controllerActivation);
		expect(markup).toContain('data-controller');
		expect(markup).toContain('controller-counter');
	});
});
