import { afterEach, describe, expect, it, vi } from 'vitest';
import { manageWindowScroll } from './scroll.ts';

const options = { scrollBehavior: 'top' as const, smoothScroll: false };

describe('manageWindowScroll', () => {
	afterEach(() => {
		history.replaceState({}, '', '/');
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('scrolls to top by default', () => {
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		manageWindowScroll(new URL('/next', window.location.origin), new URL('/prev', window.location.origin), options);
		expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
	});

	it('preserves scroll when scrollBehavior is preserve', () => {
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		manageWindowScroll(new URL('/next', window.location.origin), new URL('/prev', window.location.origin), {
			...options,
			scrollBehavior: 'preserve',
		});
		expect(scrollTo).not.toHaveBeenCalled();
	});

	it('scrolls to hash target by element id', () => {
		const section = document.createElement('section');
		section.id = 'section';
		section.scrollIntoView = vi.fn();
		document.body.append(section);

		manageWindowScroll(
			new URL('/page#section', window.location.origin),
			new URL('/page', window.location.origin),
			options,
		);

		expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant' });
	});
});
