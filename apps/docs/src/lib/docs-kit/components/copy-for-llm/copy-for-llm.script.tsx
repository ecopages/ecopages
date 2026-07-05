import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { prop } from '@ecopages/radiant/decorators/prop';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';

export type CopyForLlmProps = {
	llmUrl: string;
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

@customElement('radiant-copy-for-llm')
export class RadiantCopyForLlm extends RadiantElement {
	@prop({ type: String, attribute: 'llm-url' }) llmUrl = '';

	private copying = false;
	private resetTimeoutId: number | null = null;

	override disconnectedCallback(): void {
		if (this.resetTimeoutId) {
			clearTimeout(this.resetTimeoutId);
			this.resetTimeoutId = null;
		}
		super.disconnectedCallback();
	}

	@onEvent({ document: true, type: 'eco:after-swap' })
	onAfterSwap(): void {
		this.resetCopyState();
	}

	@onEvent({ selector: '[data-testid="copy-for-llm"]', type: 'click' })
	onCopyClick(): void {
		void this.copyForLlm();
	}

	private getButton(): HTMLButtonElement | null {
		return this.querySelector<HTMLButtonElement>('[data-testid="copy-for-llm"]');
	}

	private resetCopyState(): void {
		const button = this.getButton();
		if (!button) {
			return;
		}

		this.clearFeedbackTimeout();
		this.setCopyState(button, 'idle');
	}

	private setCopyState(button: HTMLButtonElement, state: 'idle' | 'copied' | 'error'): void {
		button.dataset.copied = state === 'copied' ? 'true' : 'false';
		button.dataset.copyError = state === 'error' ? 'true' : 'false';
	}

	private clearFeedbackTimeout(): void {
		if (this.resetTimeoutId) {
			clearTimeout(this.resetTimeoutId);
			this.resetTimeoutId = null;
		}
	}

	private scheduleIdleReset(button: HTMLButtonElement): void {
		this.clearFeedbackTimeout();
		this.resetTimeoutId = window.setTimeout(() => {
			this.setCopyState(button, 'idle');
			this.resetTimeoutId = null;
		}, COPY_FEEDBACK_MS);
	}

	private async copyForLlm(): Promise<void> {
		const button = this.getButton();

		if (!this.llmUrl || this.copying || !button) {
			return;
		}

		this.copying = true;
		button.disabled = true;
		this.setCopyState(button, 'idle');

		try {
			const response = await fetch(this.llmUrl);

			if (!response.ok) {
				this.setCopyState(button, 'error');
				this.scheduleIdleReset(button);
				return;
			}

			await copyTextToClipboard(await response.text());
			this.setCopyState(button, 'copied');
			this.scheduleIdleReset(button);
		} catch {
			this.setCopyState(button, 'error');
			this.scheduleIdleReset(button);
		} finally {
			this.copying = false;
			button.disabled = false;
		}
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-copy-for-llm': JsxCustomElementAttributes<RadiantCopyForLlm, CopyForLlmProps>;
	}
}
