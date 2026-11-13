import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CODE_COPY_FEEDBACK_MS, registerCodeCopy } from './code-copy';

let unregister: () => void = () => {};

function renderCodeBlock(): { button: HTMLButtonElement; status: HTMLElement } {
	document.body.innerHTML = `
		<figure data-rehype-pretty-code-figure>
			<pre><code>echo hi</code></pre>
			<button type="button" title="Copy code" aria-label="Copy code" data-rehype-pretty-copy="echo hi">Copy</button>
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
		expect(button.textContent).toBe('Copied');
		expect(button.getAttribute('aria-label')).toBe('Copy code');
		expect(button.hasAttribute('data-copy-error')).toBe(false);
	});

	it('announces failure when the clipboard rejects and marks the button as an error', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		const { button, status } = renderCodeBlock();

		button.click();

		await vi.waitFor(() => expect(status.textContent).toBe('Could not copy code'));
		expect(button.textContent).toBe('Try again');
		expect(button.dataset.copyError).toBe('true');
		expect(button.getAttribute('aria-label')).toBe('Copy code');
	});

	it('resets the button and clears the live region after the feedback period', async () => {
		vi.useFakeTimers();
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		const { button, status } = renderCodeBlock();

		button.click();
		await flushCopy();
		expect(button.textContent).toBe('Try again');

		vi.advanceTimersByTime(CODE_COPY_FEEDBACK_MS);

		expect(button.textContent).toBe('Copy');
		expect(button.hasAttribute('data-copy-error')).toBe(false);
		expect(status.textContent).toBe('');
	});

	it('keeps Copied for the full feedback period of a repeated click', async () => {
		vi.useFakeTimers();
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		const { button, status } = renderCodeBlock();

		button.click();
		await flushCopy();
		vi.advanceTimersByTime(CODE_COPY_FEEDBACK_MS - 200);

		button.click();
		await flushCopy();
		vi.advanceTimersByTime(CODE_COPY_FEEDBACK_MS - 100);

		expect(button.textContent).toBe('Copied');
		expect(status.textContent).toBe('Code copied to clipboard');

		vi.advanceTimersByTime(100);

		expect(button.textContent).toBe('Copy');
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
		expect(button.textContent).toBe('Try again');
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
		expect(button.textContent).toBe('Copied');
		expect(document.activeElement).toBe(button);
	});
});
