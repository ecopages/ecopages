import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CODE_COPY_FEEDBACK_MS, registerCodeCopy } from './code-copy';

let unregister: () => void = () => {};

function renderCodeBlock(): { button: HTMLButtonElement; status: HTMLElement } {
	document.body.innerHTML = `
		<figure data-rehype-pretty-code-figure>
			<pre><code>echo hi</code></pre>
			<button type="button" title="Copy code" aria-label="Copy code" data-copy-button data-rehype-pretty-copy="echo hi"><svg data-copy-icon="copy"></svg><svg data-copy-icon="check"></svg></button>
		</figure>
		<div class="code-copy-status" role="status" aria-live="polite" data-code-copy-status></div>
	`;
	const button = document.querySelector<HTMLButtonElement>('[data-rehype-pretty-copy]');
	const status = document.querySelector<HTMLElement>('[data-code-copy-status]');
	if (!button || !status) throw new Error('Expected the code block fixture to render');
	return { button, status };
}

/** Lets the clipboard promise chain settle without advancing fake timers. */
async function flushCopy(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('code block copy', () => {
	beforeEach(() => {
		unregister = registerCodeCopy();
	});

	afterEach(() => {
		unregister();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		document.body.innerHTML = '';
	});

	it('announces success in the live region and keeps the accessible name', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		const { button, status } = renderCodeBlock();

		button.click();

		await vi.waitFor(() => expect(status.textContent).toBe('Code copied to clipboard'));
		expect(writeText).toHaveBeenCalledWith('echo hi');
		expect(button.dataset.copyState).toBe('copied');
		expect(button.getAttribute('aria-label')).toBe('Copy code');
		expect(button.querySelectorAll('[data-copy-icon]')).toHaveLength(2);
	});

	it('announces failure when the clipboard rejects and marks the button as an error', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		const { button, status } = renderCodeBlock();

		button.click();

		await vi.waitFor(() => expect(status.textContent).toBe('Could not copy code'));
		expect(button.dataset.copyState).toBe('error');
		expect(button.getAttribute('aria-label')).toBe('Copy code');
	});

	it('resets the button and clears the live region after the feedback period', async () => {
		vi.useFakeTimers();
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		const { button, status } = renderCodeBlock();

		button.click();
		await flushCopy();
		expect(button.dataset.copyState).toBe('error');

		vi.advanceTimersByTime(CODE_COPY_FEEDBACK_MS);

		expect(button.hasAttribute('data-copy-state')).toBe(false);
		expect(status.textContent).toBe('');
	});

	it('keeps the copied state for the full feedback period of a repeated click', async () => {
		vi.useFakeTimers();
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		const { button, status } = renderCodeBlock();

		button.click();
		await flushCopy();
		vi.advanceTimersByTime(CODE_COPY_FEEDBACK_MS - 200);

		button.click();
		await flushCopy();
		vi.advanceTimersByTime(CODE_COPY_FEEDBACK_MS - 100);

		expect(button.dataset.copyState).toBe('copied');
		expect(status.textContent).toBe('Code copied to clipboard');

		vi.advanceTimersByTime(100);

		expect(button.hasAttribute('data-copy-state')).toBe(false);
	});

	it('restarts the one-shot animation on a repeated click by removing the state before setting it again', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		const { button } = renderCodeBlock();
		const previous: (string | null)[] = [];
		new MutationObserver((records) => previous.push(...records.map((record) => record.oldValue))).observe(button, {
			attributes: true,
			attributeFilter: ['data-copy-state'],
			attributeOldValue: true,
		});

		button.click();
		await vi.waitFor(() => expect(button.dataset.copyState).toBe('copied'));
		button.click();
		await vi.waitFor(() => expect(previous).toHaveLength(3));

		expect(previous).toEqual([null, 'copied', null]);
		expect(button.dataset.copyState).toBe('copied');
	});

	it('re-announces a repeated result by emptying the live region first', async () => {
		vi.useFakeTimers();
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		const { button, status } = renderCodeBlock();

		button.click();
		await flushCopy();
		button.click();
		await flushCopy();

		expect(status.textContent).toBe('');

		vi.advanceTimersByTime(100);

		expect(status.textContent).toBe('Code copied to clipboard');
	});

	it('reports an error and restores focus when the execCommand fallback returns false', async () => {
		vi.stubGlobal('navigator', { clipboard: undefined });
		const execCommand = vi.spyOn(document, 'execCommand').mockReturnValue(false);
		const { button, status } = renderCodeBlock();
		button.focus();

		button.click();

		await vi.waitFor(() => expect(status.textContent).toBe('Could not copy code'));
		expect(execCommand).toHaveBeenCalledWith('copy');
		expect(button.dataset.copyState).toBe('error');
		expect(document.activeElement).toBe(button);
		expect(document.querySelector('textarea')).toBeNull();
	});

	it('reports success when the execCommand fallback copies', async () => {
		vi.stubGlobal('navigator', { clipboard: undefined });
		vi.spyOn(document, 'execCommand').mockReturnValue(true);
		const { button, status } = renderCodeBlock();
		button.focus();

		button.click();

		await vi.waitFor(() => expect(status.textContent).toBe('Code copied to clipboard'));
		expect(button.dataset.copyState).toBe('copied');
		expect(document.activeElement).toBe(button);
	});
});
