import { afterEach, describe, expect, it } from 'vitest';
import { BUILD_ERROR_OVERLAY_ID, clearBuildError, showBuildError } from './build-error-overlay.ts';

const getOverlay = () => document.getElementById(BUILD_ERROR_OVERLAY_ID);
const getEntries = () => Array.from(getOverlay()?.querySelectorAll('pre') ?? []).map((entry) => entry.textContent);

describe('build error overlay', () => {
	afterEach(() => {
		document.getSelection()?.removeAllRanges();
		clearBuildError();
	});

	it('lists each distinct message as text under one label', () => {
		showBuildError('first <b>error</b>');
		showBuildError('second error');
		showBuildError('first <b>error</b>');

		expect(document.querySelectorAll(`#${BUILD_ERROR_OVERLAY_ID}`)).toHaveLength(1);
		expect(getOverlay()?.textContent).toContain('[ecopages] Error');
		expect(getEntries()).toEqual(['first <b>error</b>', 'second error']);
		expect(getOverlay()?.querySelector('b')).toBeNull();
	});

	it('stays in the page when the body is replaced', () => {
		showBuildError('error');

		document.body.replaceWith(document.createElement('body'));

		expect(getOverlay()).not.toBeNull();
	});

	it('is removed by clear, the Dismiss button and Escape', () => {
		showBuildError('error');
		clearBuildError();
		expect(getOverlay()).toBeNull();

		showBuildError('error');
		getOverlay()?.querySelector('button')?.click();
		expect(getOverlay()).toBeNull();

		showBuildError('error');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(getOverlay()).toBeNull();
	});

	it('stays open when a click ends a text selection', () => {
		showBuildError('selectable error');
		const entry = getOverlay()!.querySelector('pre')!;
		document.getSelection()?.selectAllChildren(entry);

		entry.click();

		expect(getOverlay()).not.toBeNull();
		document.getSelection()?.removeAllRanges();
		entry.click();
		expect(getOverlay()).toBeNull();
	});
});
