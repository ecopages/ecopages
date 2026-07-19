/** @jsxImportSource @ecopages/jsx */
import { RadiantController, RadiantElement, customElement, signal, stopControllers } from '@ecopages/radiant';
import { controller } from '@ecopages/radiant/decorators/controller';

export type TestButton = HTMLButtonElement & {
	ssrMarker?: string;
};

export type ControllerHost = HTMLElement & {
	count?: number;
};

export function getHydrationMarkerAttributes(root: ParentNode): string[] {
	const elements = [root, ...Array.from(root.querySelectorAll('*'))].filter(
		(node): node is Element => node instanceof Element,
	);
	const names: string[] = [];

	for (const element of elements) {
		for (const attributeName of element.getAttributeNames()) {
			if (attributeName.startsWith('data-radiant-jsx-bind-')) {
				names.push(attributeName);
			}
		}
	}

	return names;
}

export function defineCounterComponent(tagName: string) {
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

export function defineControllerComponent(identifier: string) {
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
	return TestCounterController;
}

export function parseMarkupHost(markup: string, buttonSelector: string): { host: HTMLElement; ssrButton: TestButton } {
	const template = document.createElement('template');
	template.innerHTML = markup;

	const host = template.content.firstElementChild as HTMLElement | null;
	const ssrButton = host?.querySelector(buttonSelector) as TestButton | null;

	if (!host || !ssrButton) {
		throw new Error(`Expected SSR markup to include a host and ${buttonSelector}.`);
	}

	return { host, ssrButton };
}

export function resetRadiantHydrationTestState(): void {
	document.body.innerHTML = '';
	stopControllers();
}
