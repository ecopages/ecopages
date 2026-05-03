/** @jsxImportSource @ecopages/jsx */
import { afterEach, describe, expect, it } from 'vitest';
import { RadiantController, RadiantElement, customElement, signal, startControllers, stopControllers } from '@ecopages/radiant';
import { controller } from '@ecopages/radiant/decorators/controller';
import { installRadiantHydrator, uninstallRadiantHydrator } from '@ecopages/radiant/client/hydrator';
import '@ecopages/radiant/server/render-component';
import { renderControllerToString } from '@ecopages/radiant/server/render-controller';

let nextTagId = 0;

type TestButton = HTMLButtonElement & {
	ssrMarker?: string;
};

type ControllerHost = HTMLElement & {
	count?: number;
};

function createTagName(): string {
	nextTagId += 1;
	return `ecopages-jsx-radiant-counter-${nextTagId}`;
}

function defineCounterComponent(tagName: string) {
	class TestCounter extends RadiantElement<{ count: number }> {
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
	const markup = new Counter().renderHostToString({ mode: 'hydrate' });
	const template = document.createElement('template');
	template.innerHTML = markup;

	const host = template.content.firstElementChild as HTMLElement | null;
	const ssrButton = host?.querySelector('[data-testid="counter"]') as TestButton | null;

	if (!host || !ssrButton) {
		throw new Error('Expected SSR markup to include a hydrated counter host and button.');
	}

	return { host, markup, ssrButton };
}

async function createSsrControllerHost(identifier: string): Promise<{
	host: ControllerHost;
	markup: string;
	ssrButton: TestButton;
}> {
	class TestCounterController extends RadiantController<{ count: number }> {
		constructor(host: Element) {
			super(host);
			this.createReactiveProp('count', { type: Number, bind: true });
		}

		override render() {
			return <button data-testid="controller-counter">{this.$.count}</button>;
		}
	}

	controller(identifier)(TestCounterController);

	const markup = await renderControllerToString(TestCounterController, {
		tagName: 'section',
		initialize(controllerInstance) {
			(controllerInstance.host as ControllerHost).count = 1;
		},
	});
	const template = document.createElement('template');
	template.innerHTML = markup;

	const host = template.content.firstElementChild as ControllerHost | null;
	const ssrButton = host?.querySelector('[data-testid="controller-counter"]') as TestButton | null;

	if (!host || !ssrButton) {
		throw new Error('Expected SSR markup to include a controller host and button.');
	}

	return { host, markup, ssrButton };
}

describe('RadiantElement hydration contract', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		uninstallRadiantHydrator();
		stopControllers();
	});

	it('hydrates SSR RadiantElement hosts in place when the hydrator is installed before first connect', async () => {
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

describe('RadiantController SSR activation contract', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		stopControllers();
	});

	it('connects SSR controller hosts and updates host-backed reactive props', async () => {
		const { host, markup, ssrButton } = await createSsrControllerHost(
			`ecopages-jsx-controller-counter-${nextTagId += 1}`,
		);

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
