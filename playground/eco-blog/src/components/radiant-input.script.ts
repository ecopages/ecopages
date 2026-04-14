import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { query } from '@ecopages/radiant/decorators/query';
import { prop } from '@ecopages/radiant/decorators/prop';

export type RadiantInputProps = {
	value?: string;
	label?: string;
	name?: string;
	required?: boolean;
};

@customElement('radiant-input')
export class RadiantInput extends RadiantElement {
	@prop({ type: String, reflect: true }) declare value: string;
	@prop({ type: String, reflect: true }) declare label: string;
	@prop({ type: String, reflect: true }) declare name: string;
	@prop({ type: Boolean, reflect: true }) declare required: boolean;

	@query({ ref: 'input' }) input!: HTMLInputElement;

	@onEvent({ ref: 'input', type: 'input' })
	onInputChange() {
		this.value = this.input.value;
		this.dispatchEvent(
			new CustomEvent('change', {
				detail: { value: this.value },
				bubbles: true,
				composed: true,
			}),
		);
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-input': HtmlTag & RadiantInputProps;
		}
	}
}
