const codeCopySelector = '[data-rehype-pretty-copy]';
const codeCopyStatusSelector = '[data-code-copy-status]';

/** How long the button shows Copied or Try again, and how long the live region keeps the result. */
export const CODE_COPY_FEEDBACK_MS = 1200;

/**
 * @remarks
 * Screen readers ignore a live region write that leaves its text unchanged, so a repeated result is
 * written after the region has been empty for this long.
 */
const CODE_COPY_REANNOUNCE_DELAY_MS = 100;

const buttonResetTimers = new WeakMap<HTMLButtonElement, number>();
let statusTimer: number | undefined;

/**
 * @remarks
 * `execCommand('copy')` is the fallback for browsers without the async Clipboard API. It reports
 * failure by returning `false`, not by throwing. Selecting the textarea moves focus, so focus goes
 * back to the button that started the copy.
 */
async function copyTextToClipboard(text: string, button: HTMLButtonElement): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	document.body.append(textarea);
	try {
		textarea.select();
		if (!document.execCommand('copy')) {
			throw new Error('Copy command was rejected');
		}
	} finally {
		textarea.remove();
		button.focus({ preventScroll: true });
	}
}

/**
 * Writes the copy result into the base layout's live region and clears it after the feedback period.
 *
 * @remarks
 * The region is looked up on each call because browser-router navigation can replace it.
 */
function announce(message: string): void {
	const region = document.querySelector<HTMLElement>(codeCopyStatusSelector);
	if (!region) return;

	window.clearTimeout(statusTimer);
	const write = () => {
		region.textContent = message;
		statusTimer = window.setTimeout(() => {
			region.textContent = '';
		}, CODE_COPY_FEEDBACK_MS);
	};

	if (region.textContent === '') {
		write();
		return;
	}

	region.textContent = '';
	statusTimer = window.setTimeout(write, CODE_COPY_REANNOUNCE_DELAY_MS);
}

/**
 * @remarks
 * The button keeps its accessible name ("Copy code"); only the visible text changes. The result is
 * announced through the live region instead.
 */
function showCodeCopyFeedback(button: HTMLButtonElement, isError: boolean): void {
	window.clearTimeout(buttonResetTimers.get(button));

	if (isError) {
		button.dataset.copyError = 'true';
	} else {
		button.removeAttribute('data-copy-error');
	}
	button.textContent = isError ? 'Try again' : 'Copied';
	announce(isError ? 'Could not copy code' : 'Code copied to clipboard');

	buttonResetTimers.set(
		button,
		window.setTimeout(() => {
			buttonResetTimers.delete(button);
			button.removeAttribute('data-copy-error');
			button.textContent = 'Copy';
		}, CODE_COPY_FEEDBACK_MS),
	);
}

function onCodeCopyClick(event: MouseEvent): void {
	const target = event.target instanceof Element ? event.target.closest(codeCopySelector) : null;
	if (!(target instanceof HTMLButtonElement)) return;

	const source = target.dataset.rehypePrettyCopy;
	if (!source) return;

	void copyTextToClipboard(source, target)
		.then(() => showCodeCopyFeedback(target, false))
		.catch(() => showCodeCopyFeedback(target, true));
}

/**
 * Handles clicks on fenced code copy buttons for the whole document.
 *
 * @returns A function that removes the listener.
 */
export function registerCodeCopy(): () => void {
	document.addEventListener('click', onCodeCopyClick);
	return () => document.removeEventListener('click', onCodeCopyClick);
}
