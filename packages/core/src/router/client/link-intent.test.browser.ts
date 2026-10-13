import { describe, expect, it } from 'vitest';
import { getAnchorFromNavigationEvent } from './link-intent.ts';

describe('getAnchorFromNavigationEvent', () => {
	it('returns the anchor when the event target is a text node inside it', () => {
		const anchor = document.createElement('a');
		anchor.href = '/fast';
		anchor.setAttribute('data-eco-link', 'true');
		const textNode = document.createTextNode('fast-link');
		anchor.append(textNode);
		document.body.append(anchor);

		const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
		Object.defineProperty(event, 'target', {
			configurable: true,
			value: textNode,
		});

		expect(getAnchorFromNavigationEvent(event, 'a[data-eco-link]')).toBe(anchor);
	});

	it('returns the closest matching anchor for nested element targets', () => {
		const anchor = document.createElement('a');
		anchor.href = '/fast';
		anchor.setAttribute('data-eco-link', 'true');
		const span = document.createElement('span');
		span.textContent = 'fast-link';
		anchor.append(span);
		document.body.append(anchor);

		const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
		Object.defineProperty(event, 'target', {
			configurable: true,
			value: span,
		});

		expect(getAnchorFromNavigationEvent(event, 'a[data-eco-link]')).toBe(anchor);
	});
});
