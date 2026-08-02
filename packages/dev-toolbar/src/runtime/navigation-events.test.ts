import { describe, expect, it, vi } from 'vitest';
import { subscribeToNavigationEvents } from './navigation-events.ts';

describe('navigation event dispatcher', () => {
	it('uses one document listener for all subscribers of an event', () => {
		const target = new EventTarget();
		const doc = target as unknown as Document;
		const addEventListener = vi.spyOn(doc, 'addEventListener');
		const removeEventListener = vi.spyOn(doc, 'removeEventListener');
		const first = vi.fn();
		const second = vi.fn();

		const unsubscribeFirst = subscribeToNavigationEvents(doc, ['eco:page-load'], first);
		const unsubscribeSecond = subscribeToNavigationEvents(doc, ['eco:page-load'], second);

		expect(addEventListener).toHaveBeenCalledTimes(1);
		target.dispatchEvent(new Event('eco:page-load'));
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();

		unsubscribeFirst();
		expect(removeEventListener).not.toHaveBeenCalled();
		unsubscribeSecond();
		expect(removeEventListener).toHaveBeenCalledTimes(1);
	});
});
