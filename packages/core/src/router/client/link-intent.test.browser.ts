import { describe, expect, it } from 'vitest';
import { getAnchorFromNavigationEvent, recoverPendingNavigationHref } from './link-intent.ts';

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

describe('recoverPendingNavigationHref', () => {
	it('returns null for stale or missing pending intent state', () => {
		expect(recoverPendingNavigationHref(null, true, 10)).toBeNull();
		expect(recoverPendingNavigationHref({ href: '/fast', timestamp: 0 }, false, 10)).toBeNull();
		expect(recoverPendingNavigationHref({ href: '/fast', timestamp: 0 }, true, 2000, 1000)).toBeNull();
	});

	it('returns the captured href while a navigation is still in flight', () => {
		expect(recoverPendingNavigationHref({ href: '/fast', timestamp: 10 }, true, 20, 1000)).toBe('/fast');
	});
});
