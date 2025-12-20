import type { EcoComponent } from '@ecopages/core';
import type { RadiantSwitchProps } from './switch.script';

export const RadiantSwitch: EcoComponent<
	RadiantSwitchProps & {
		label?: string;
		hiddenLabel?: boolean;
	}
> = ({ id, checked, disabled, hiddenLabel, label }) => {
	return (
		<radiant-switch id={id} checked={checked} disabled={disabled}>
			<label class="switch-wrapper">
				{label ? (
					<span class={hiddenLabel ? 'sr-only' : 'label'} id={`${id}-label`}>
						{label}
					</span>
				) : null}
				<button
					class="switch"
					data-ref="switch"
					role="switch"
					aria-checked={checked}
					aria-labelledby={label ? `${id}-label` : undefined}
					aria-label={!label ? 'Toggle switch' : undefined}
					tabindex="0"
					disabled={disabled}
				>
					<span class="thumb" aria-hidden="true"></span>
				</button>
			</label>
		</radiant-switch>
	);
};

RadiantSwitch.config = {
	dependencies: {
		stylesheets: ['./switch.css'],
		scripts: ['./switch.script.ts'],
	},
};
