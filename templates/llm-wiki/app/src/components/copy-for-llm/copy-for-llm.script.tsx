export type CopyForLlmProps = {
	path: string;
	label?: string;
};

const COPY_FEEDBACK_MS = 1200;

async function copyTextToClipboard(text: string): Promise<void> {
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
	textarea.select();
	document.execCommand('copy');
	textarea.remove();
}

function resetButton(button: HTMLButtonElement): void {
	button.dataset.copied = 'false';
	button.dataset.copyError = 'false';
}

/**
 * @remarks
 * Fetches the markdown alternate from `data-markdown-url` and copies it.
 * The `.md` URL works under static `preview` as well as `dev` / `start`.
 */
function onCopyForLlmClick(event: Event): void {
	const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy-for-llm]') : null;
	if (!button) {
		return;
	}

	const path = button.dataset.markdownUrl;
	if (!path || button.disabled) {
		return;
	}

	event.preventDefault();
	button.disabled = true;
	resetButton(button);

	void (async () => {
		try {
			const response = await fetch(path);
			if (!response.ok) {
				button.dataset.copyError = 'true';
				return;
			}

			await copyTextToClipboard(await response.text());
			button.dataset.copied = 'true';
		} catch {
			button.dataset.copyError = 'true';
		} finally {
			button.disabled = false;
			window.setTimeout(() => resetButton(button), COPY_FEEDBACK_MS);
		}
	})();
}

document.addEventListener('click', onCopyForLlmClick);
