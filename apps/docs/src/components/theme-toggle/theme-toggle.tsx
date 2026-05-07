import { eco } from '@ecopages/core';
import type { RadiantSwitchProps } from '../switch/switch.script';
import './theme-toggle.script';

export const ThemeToggle = eco.component({
	dependencies: {
		stylesheets: ['../switch/switch.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
	render(props: RadiantSwitchProps & { class?: string; 'data-eco-persist'?: string }) {
		return (
			<theme-toggle
				id={props.id}
				class={`radiant-switch ${props.class ?? ''}`}
				data-eco-persist={props['data-eco-persist']}
				prop:label={props.label}
				prop:checked={props.checked}
				prop:disabled={props.disabled}
				prop:hiddenLabel={props.hiddenLabel}
			/>
		);
	},
});
