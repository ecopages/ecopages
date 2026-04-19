/** @jsxImportSource @ecopages/jsx */
import { afterEach, describe, expect, it } from 'vitest';
import { RadiantComponent, customElement, signal } from '@ecopages/radiant';
import { installRadiantHydrator, uninstallRadiantHydrator } from '@ecopages/radiant/client/hydrator';
import '@ecopages/radiant/server/render-component';

let nextTagId = 0;

type TestButton = HTMLButtonElement & {
	ssrMarker?: string;
};

function createTagName(): string {
	nextTagId += 1;
	return `ecopages-jsx-radiant-counter-${nextTagId}`;
}

function defineCounterComponent(tagName: string) {
	class TestCounter extends RadiantComponent<{ count: number }> {
		declare count: number;

		override render() {
			return <button data-testid="counter">{this.$.count}</button>;
		}
	}

	signal({ bind: true, hydrate: Number, initial: 1 })(TestCounter.prototype, 'count');
	customElement(tagName)(TestCounter);
	return TestCounter;
}

function createSsrHost(tagName: string): { host: HTMLElement; markup: string; ssrButton: TestButton } {
	const Counter = defineCounterComponent(tagName);
	const markup = new Counter().renderHostToString({ hydrate: true });
	const template = document.createElement('template');
	template.innerHTML = markup;

	const host = template.content.firstElementChild as HTMLElement | null;
	const ssrButton = host?.querySelector('[data-testid="counter"]') as TestButton | null;

	if (!host || !ssrButton) {
		throw new Error('Expected SSR markup to include a hydrated counter host and button.');
	}

	return { host, markup, ssrButton };
}

describe('RadiantComponent hydration contract', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		uninstallRadiantHydrator();
	});

	it('hydrates SSR RadiantComponent hosts in place when the hydrator is installed before first connect', async () => {
		const { host, markup, ssrButton } = createSsrHost(createTagName());

		expect(markup).toContain('data-hydration');

		ssrButton.ssrMarker = 'kept';
		installRadiantHydrator();
		document.body.append(host);
		await Promise.resolve();

		const hydratedButton = document.querySelector('[data-testid="counter"]') as TestButton | null;
		expect(hydratedButton).toBe(ssrButton);
		expect(hydratedButton?.ssrMarker).toBe('kept');
		expect(hydratedButton?.textContent).toBe('1');
	});

	it('falls back to a fresh client render when the explicit Radiant hydrator is missing', async () => {
		const { host, markup, ssrButton } = createSsrHost(createTagName());

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
