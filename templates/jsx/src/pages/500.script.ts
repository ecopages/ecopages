import { customElement } from '@ecopages/radiant';

const COPY_LABEL = 'Copy error';

function fallbackCopy(value: string): void {
	const area = document.createElement('textarea');
	area.value = value;
	area.setAttribute('readonly', '');
	area.style.position = 'absolute';
	area.style.left = '-9999px';
	document.body.appendChild(area);
	area.select();
	try {
		if (!document.execCommand('copy')) {
			throw new Error('Clipboard copy failed');
		}
	} finally {
		document.body.removeChild(area);
	}
}

function copyTextToClipboard(value: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(value);
	}
	return Promise.resolve().then(() => {
		fallbackCopy(value);
	});
}

@customElement('radiant-error-details')
export class RadiantErrorDetails extends HTMLElement {
	private resetTimer: number | undefined;
	private handleClick: (() => void) | undefined;

	override disconnectedCallback(): void {
		window.clearTimeout(this.resetTimer);
		this.resetTimer = undefined;
		const button = this.querySelector('button');
		if (button && this.handleClick) {
			button.removeEventListener('click', this.handleClick);
		}
		this.handleClick = undefined;
	}

	override connectedCallback(): void {
		if (this.handleClick) return;

		const button = this.querySelector('button');
		const payload = this.querySelector('pre[hidden]')?.textContent ?? '';
		if (!button || !payload) return;

		this.handleClick = () => {
			void copyTextToClipboard(payload)
				.then(() => {
					button.textContent = 'Copied';
					window.clearTimeout(this.resetTimer);
					this.resetTimer = window.setTimeout(() => {
						button.textContent = COPY_LABEL;
					}, 2000);
				})
				.catch(() => {
					button.textContent = 'Copy failed';
					window.clearTimeout(this.resetTimer);
					this.resetTimer = window.setTimeout(() => {
						button.textContent = COPY_LABEL;
					}, 3000);
				});
		};
		button.addEventListener('click', this.handleClick);
	}
}
