import type { EcoComponent } from '@ecopages/core';
import { SwitchContent } from '../switch/switch.kita';
import type { RadiantSwitchProps } from '../switch/switch.script';

export const ThemeToggle: EcoComponent<
	RadiantSwitchProps & {
		label?: string;
		hiddenLabel?: boolean;
	}
> = (props) => {
	return (
		<theme-toggle class="radiant-switch" {...props}>
			<SwitchContent disabled={props.disabled} />
		</theme-toggle>
	);
};

ThemeToggle.config = {
	dependencies: {
		stylesheets: ['../switch/switch.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
};
