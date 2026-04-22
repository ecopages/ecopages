import type { EcoComponent } from '@ecopages/core';
import type { RadiantSwitchProps } from './switch.script';
import './switch.script';

export const RadiantSwitch: EcoComponent<RadiantSwitchProps> = (props) => {
	return <radiant-switch class="radiant-switch" {...props}></radiant-switch>;
};

RadiantSwitch.config = {
	dependencies: {
		stylesheets: ['./switch.css'],
		scripts: ['./switch.script.tsx'],
	},
};
