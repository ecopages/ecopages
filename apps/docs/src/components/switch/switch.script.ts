import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { query } from '@ecopages/radiant/decorators/query';
import { onUpdated } from '@ecopages/radiant/decorators/on-updated';
import { reactiveProp } from '@ecopages/radiant/decorators/reactive-prop';

export type RadiantSwitchProps = {
	id?: string;
	checked?: boolean;
	disabled?: boolean;
};

export type RadiantSwitchEvent = { checked: boolean };

@customElement('radiant-switch')
export class RadiantSwitch extends RadiantElement {
	@reactiveProp({ type: Boolean, reflect: true, defaultValue: false })
	checked!: boolean;

	@reactiveProp({ type: Boolean, reflect: true, defaultValue: false })
	disabled!: boolean;

	@query({ ref: 'switch' })
	switch!: HTMLInputElement;

	@onEvent({ ref: 'switch', type: 'click' })
	toggle() {
		if (!this.disabled) {
			this.checked = !this.checked;
			this.dispatchEvent(
				new CustomEvent<RadiantSwitchEvent>('change', {
					detail: { checked: this.checked },
					bubbles: true,
				}),
			);
		}
	}

	@onUpdated('checked')
	updateAriaChecked() {
		this.switch.setAttribute('aria-checked', String(this.checked));
	}
}

@customElement('dark-mode-toggle')
export class DarkModeToggle extends RadiantSwitch {
	@onUpdated('checked')
	updateTheme() {
		document.body.classList.toggle('dark', this.checked);
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-switch': RadiantSwitchProps & { children: JSX.Element };
			'dark-mode-toggle': RadiantSwitchProps & { children: JSX.Element };
		}
	}
}
