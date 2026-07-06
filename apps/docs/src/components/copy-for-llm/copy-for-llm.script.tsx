import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { prop } from '@ecopages/radiant/decorators/prop';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { copyForLlmCheckIcon, copyForLlmSparkleIcon } from './copy-for-llm-icons';

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
	@prop({ type: String }) label = 'Copy for LLM';
	@state copyState: 'idle' | 'copied' | 'error' = 'idle';
	@state copying = false;

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
		if (this.resetTimeoutId) {
			clearTimeout(this.resetTimeoutId);
			this.resetTimeoutId = null;
		}
		this.copyState = 'idle';
	}

	handleCopy = async (): Promise<void> => {
		if (!this.llmUrl || this.copying) {
			return;
		}

		this.copying = true;
		this.copyState = 'idle';

		try {
			const response = await fetch(this.llmUrl);

			if (!response.ok) {
				this.copyState = 'error';
				return;
			}

			await copyTextToClipboard(await response.text());
			this.copyState = 'copied';
		} catch {
			this.copyState = 'error';
		} finally {
			this.copying = false;

			if (this.copyState === 'copied' || this.copyState === 'error') {
				if (this.resetTimeoutId) {
					clearTimeout(this.resetTimeoutId);
				}
				this.resetTimeoutId = window.setTimeout(() => {
					this.copyState = 'idle';
					this.resetTimeoutId = null;
				}, COPY_FEEDBACK_MS);
			}
		}
	};

	override render() {
		return (
			<button
				type="button"
				class="docs-copy-for-llm"
				aria-label={this.label}
				data-testid="copy-for-llm"
				data-copied={this.copyState === 'copied' ? 'true' : 'false'}
				data-copy-error={this.copyState === 'error' ? 'true' : 'false'}
				disabled={this.copying}
				on:click={this.handleCopy}
			>
				<span class="docs-copy-for-llm__icon docs-copy-for-llm__icon--sparkle" aria-hidden="true">
					{copyForLlmSparkleIcon}
				</span>
				<span class="docs-copy-for-llm__icon docs-copy-for-llm__icon--check" aria-hidden="true">
					{copyForLlmCheckIcon}
				</span>
				<span class="docs-copy-for-llm__label">{this.label}</span>
			</button>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-copy-for-llm': JsxCustomElementAttributes<RadiantCopyForLlm, CopyForLlmProps>;
	}
}
