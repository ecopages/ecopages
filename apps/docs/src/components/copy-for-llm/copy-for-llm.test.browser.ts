import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RadiantCopyForLlm } from './copy-for-llm.script';

function resetDom(): void {
	document.body.innerHTML = '';
}

async function createCopyForLlm(options: { llmUrl?: string; label?: string } = {}): Promise<{
	element: RadiantCopyForLlm;
	button: HTMLButtonElement;
}> {
	const element = document.createElement('radiant-copy-for-llm') as RadiantCopyForLlm;
	element.llmUrl = options.llmUrl ?? '/docs-llm/getting-started/introduction.md';
	element.label = options.label ?? 'Copy for LLM';

	document.body.appendChild(element);

	await vi.waitFor(() => {
		const button = element.querySelector<HTMLButtonElement>('[data-testid="copy-for-llm"]');
		if (!button) {
			throw new Error('Expected copy button after render');
		}
	});

	const button = element.querySelector<HTMLButtonElement>('[data-testid="copy-for-llm"]');
	if (!button) {
		throw new Error('Expected copy button in light DOM');
	}

	return { element, button };
}

describe('RadiantCopyForLlm', () => {
	beforeEach(() => {
		resetDom();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				text: async () => '# Docs page',
			})),
		);
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
	});

	afterEach(() => {
		resetDom();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('copies markdown and shows the copied state', async () => {
		const { button } = await createCopyForLlm();
		button.click();

		await vi.waitFor(() => {
			expect(button.dataset.copied).toBe('true');
		});
		expect(button.dataset.copyError).toBe('false');
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Docs page');
	});

	it('shows an error state when the fetch fails', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			text: async () => '',
		} as Response);

		const { button } = await createCopyForLlm();
		button.click();

		await vi.waitFor(() => {
			expect(button.dataset.copyError).toBe('true');
		});
		expect(button.dataset.copied).toBe('false');
		expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
	});

	it('resets copied state after navigation swap', async () => {
		const { button } = await createCopyForLlm();
		button.click();

		await vi.waitFor(() => {
			expect(button.dataset.copied).toBe('true');
		});

		document.dispatchEvent(new CustomEvent('eco:after-swap'));

		await vi.waitFor(() => {
			expect(button.dataset.copied).toBe('false');
		});
		expect(button.dataset.copyError).toBe('false');
	});

	it('does nothing when llm-url is missing', async () => {
		const { button } = await createCopyForLlm({ llmUrl: '' });
		button.click();

		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(fetch).not.toHaveBeenCalled();
		expect(button.dataset.copied).not.toBe('true');
	});
});
