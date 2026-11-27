import { describe, expect, it } from 'vitest';
import { trackLoadedVendorUrls } from './loaded-vendor-urls.ts';

type Entry = { name: string };

/**
 * A window whose resource timing buffer and observer the test controls.
 *
 * @remarks
 * `buffered` is what `getEntriesByType` returns; `observed` is delivered to the observer's callback on demand, as
 * the browser does when a resource finishes after the observer started.
 */
function createWindow(buffered: Entry[] = []) {
	let deliver: (entries: Entry[]) => void = () => undefined;
	class FakeObserver {
		constructor(callback: (list: { getEntries: () => Entry[] }) => void) {
			deliver = (entries) => callback({ getEntries: () => entries });
		}
		observe(): void {}
	}
	const win = {
		location: { href: 'http://localhost:3000/products/chair' },
		performance: { getEntriesByType: () => buffered },
		PerformanceObserver: FakeObserver,
	};
	return { win, deliver: (entries: Entry[]) => deliver(entries), buffered };
}

describe('trackLoadedVendorUrls', () => {
	it('says a page loaded a vendor file that is in the resource timing buffer', () => {
		const { win } = createWindow([{ name: 'http://localhost:3000/assets/vendors/lit.abc.js' }]);

		const tracker = trackLoadedVendorUrls(win);

		expect(tracker.hasLoadedAny(['/assets/vendors/lit.abc.js'])).toBe(true);
	});

	it('says a page did not load a vendor file it never requested', () => {
		const { win } = createWindow([{ name: 'http://localhost:3000/assets/vendors/lit.abc.js' }]);

		const tracker = trackLoadedVendorUrls(win);

		expect(tracker.hasLoadedAny(['/assets/vendors/react.def.js'])).toBe(false);
	});

	it('ignores files outside the vendors folder', () => {
		const { win } = createWindow([{ name: 'http://localhost:3000/assets/page.js' }]);

		const tracker = trackLoadedVendorUrls(win);

		expect(tracker.hasLoadedAny(['/assets/page.js'])).toBe(false);
	});

	it('keeps a file the buffer dropped, because the observer saw it', () => {
		const { win, deliver, buffered } = createWindow();
		const tracker = trackLoadedVendorUrls(win);

		deliver([{ name: 'http://localhost:3000/assets/vendors/lit.abc.js' }]);
		buffered.length = 0;

		expect(tracker.hasLoadedAny(['/assets/vendors/lit.abc.js'])).toBe(true);
	});

	it('finds a file that entered the buffer after the observer last ran', () => {
		const { win, buffered } = createWindow();
		const tracker = trackLoadedVendorUrls(win);

		buffered.push({ name: 'http://localhost:3000/assets/vendors/lit.abc.js' });

		expect(tracker.hasLoadedAny(['/assets/vendors/lit.abc.js'])).toBe(true);
	});

	it('says yes to any change when the page cannot see what it loaded', () => {
		const { win } = createWindow();
		const withoutObserver = { ...win, PerformanceObserver: undefined };

		expect(trackLoadedVendorUrls(withoutObserver).hasLoadedAny(['/assets/vendors/lit.abc.js'])).toBe(true);
	});
});
