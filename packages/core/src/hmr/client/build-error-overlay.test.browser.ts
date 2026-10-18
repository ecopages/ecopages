import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
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

	it('is removed by clear, the Dismiss button and Escape', async () => {
		showBuildError('error');
		clearBuildError();
		expect(getOverlay()).toBeNull();

		showBuildError('error');
		await userEvent.click(getOverlay()!.querySelector('button')!);
		expect(getOverlay()).toBeNull();

		showBuildError('error');
		await userEvent.keyboard('{Escape}');
		expect(getOverlay()).toBeNull();
	});

	it('stays open when a click ends a text selection', async () => {
		showBuildError('selectable error');
		const entry = getOverlay()!.querySelector('pre')!;

		await userEvent.dragAndDrop(entry, entry, {
			sourcePosition: { x: 2, y: 5 },
			targetPosition: { x: 60, y: 5 },
		});

		expect(document.getSelection()?.isCollapsed).toBe(false);
		expect(getOverlay()).not.toBeNull();
		await userEvent.click(entry);
		expect(getOverlay()).toBeNull();
	});
});
