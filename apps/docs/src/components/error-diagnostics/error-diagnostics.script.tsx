import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { prop } from '@ecopages/radiant/decorators/prop';
import { state } from '@ecopages/radiant/decorators/state';
import { RuiButton } from '@ecopages/radiant-ui/button';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';

export type ErrorDiagnosticsProps = { message?: string; stack?: string };

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
	const copied = document.execCommand('copy');
	textarea.remove();
	if (!copied) throw new Error('Clipboard copy failed');
}

@customElement('radiant-error-diagnostics')
export class RadiantErrorDiagnostics extends RadiantElement {
	@prop({ type: String }) message = '';
	@prop({ type: String }) stack = '';
	@state copyState: 'idle' | 'copied' | 'failed' = 'idle';

	private resetTimeoutId: number | undefined;

	override disconnectedCallback(): void {
		if (this.resetTimeoutId) clearTimeout(this.resetTimeoutId);
		super.disconnectedCallback();
	}

	handleCopy = async (): Promise<void> => {
		try {
			const payload = [this.message ? `Message: ${this.message}` : '', this.stack ? `Stack:\n${this.stack}` : '']
				.filter(Boolean)
				.join('\n\n');
			await copyTextToClipboard(payload);
			this.copyState = 'copied';
		} catch {
			this.copyState = 'failed';
		}

		if (this.resetTimeoutId) clearTimeout(this.resetTimeoutId);
		this.resetTimeoutId = window.setTimeout(() => {
			this.copyState = 'idle';
			this.resetTimeoutId = undefined;
		}, 2000);
	};

	override render() {
		return (
			<section class="error-diagnostics" aria-label="Development error diagnostics">
				<div class="error-diagnostics__header">
					<span>Stack trace</span>
					<RuiButton type="button" size="sm" variant="outline" on:click={this.handleCopy} aria-live="polite">
						{this.copyState === 'copied'
							? 'Copied'
							: this.copyState === 'failed'
								? 'Copy failed'
								: 'Copy error'}
					</RuiButton>
				</div>
				{this.message ? <p class="error-diagnostics__message">{this.message}</p> : null}
				{this.stack ? <pre class="error-diagnostics__stack">{this.stack}</pre> : null}
			</section>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-error-diagnostics': JsxCustomElementAttributes<RadiantErrorDiagnostics, ErrorDiagnosticsProps>;
	}
}
