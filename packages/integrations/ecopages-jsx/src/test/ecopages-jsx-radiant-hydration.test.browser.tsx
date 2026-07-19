/** @jsxImportSource @ecopages/jsx */
import { afterEach, describe, expect, it } from 'vitest';
import { startControllers } from '@ecopages/radiant';
import { installRadiantHydrator, uninstallRadiantHydrator } from '@ecopages/radiant/client/hydrator';
import { radiantHydrationMarkupFixtures } from './ecopages-jsx-radiant-hydration.markup-fixtures.ts';
import {
	defineControllerComponent,
	defineCounterComponent,
	getHydrationMarkerAttributes,
	parseMarkupHost,
	resetRadiantHydrationTestState,
	type ControllerHost,
	type TestButton,
} from './ecopages-jsx-radiant-hydration.test-shared.tsx';

function mountElementFixture(fixtureKey: 'elementHydrate' | 'elementFallback') {
	defineCounterComponent(radiantHydrationMarkupFixtures.tagNames[fixtureKey]);
	const markup = radiantHydrationMarkupFixtures.markups[fixtureKey];
	const { host, ssrButton } = parseMarkupHost(markup, '[data-testid="counter"]');

	return { host, markup, ssrButton };
}

function mountControllerFixture() {
	defineControllerComponent(radiantHydrationMarkupFixtures.tagNames.controllerActivation);
	const markup = radiantHydrationMarkupFixtures.markups.controllerActivation;
	const { host, ssrButton } = parseMarkupHost(markup, '[data-testid="controller-counter"]');

	return { host: host as ControllerHost, markup, ssrButton };
}

describe('RadiantElement hydration contract', () => {
	afterEach(() => {
		uninstallRadiantHydrator();
		resetRadiantHydrationTestState();
	});

	it('hydrates SSR RadiantElement hosts in place when the hydrator is installed before first connect', async () => {
		const { host, markup, ssrButton } = mountElementFixture('elementHydrate');

		expect(markup).toContain('data-hydration');

		ssrButton.ssrMarker = 'kept';
		installRadiantHydrator();
		document.body.append(host);
		await Promise.resolve();

		const hydratedButton = document.querySelector('[data-testid="counter"]') as TestButton | null;
		expect(hydratedButton).toBe(ssrButton);
		expect(hydratedButton?.ssrMarker).toBe('kept');
		expect(hydratedButton?.textContent).toBe('1');
		expect(getHydrationMarkerAttributes(document.body)).toEqual([]);
	});

	it('falls back to a fresh client render when the explicit Radiant hydrator is missing', async () => {
		const { host, markup, ssrButton } = mountElementFixture('elementFallback');

		expect(markup).toContain('data-hydration');

		ssrButton.ssrMarker = 'replaced';
		document.body.append(host);
		await Promise.resolve();

		const hydratedButton = document.querySelector('[data-testid="counter"]') as TestButton | null;
		expect(hydratedButton).not.toBeNull();
		expect(hydratedButton).not.toBe(ssrButton);
		expect(hydratedButton?.ssrMarker).toBeUndefined();
		expect(hydratedButton?.textContent).toBe('1');
	});
});

describe('RadiantController SSR activation contract', () => {
	afterEach(() => {
		resetRadiantHydrationTestState();
	});

	it('connects SSR controller hosts and updates host-backed reactive props', async () => {
		const { host, markup, ssrButton } = mountControllerFixture();

		expect(markup).toContain('data-controller');
		expect(markup).toContain('controller-counter');

		host.count = 1;
		ssrButton.ssrMarker = 'server';
		document.body.append(host);
		startControllers(document);
		await Promise.resolve();

		const hydratedButton = document.querySelector('[data-testid="controller-counter"]') as TestButton | null;
		expect(hydratedButton).not.toBe(ssrButton);
		expect(hydratedButton?.ssrMarker).toBeUndefined();
		expect(hydratedButton?.textContent).toBe('1');

		host.count = 2;
		await Promise.resolve();

		expect(hydratedButton?.textContent).toBe('2');
	});
});
