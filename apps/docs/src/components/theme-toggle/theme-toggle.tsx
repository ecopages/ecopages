import type { EcoComponent } from '@ecopages/core';
import type { RadiantSwitchProps } from '../switch/switch.script';
import './theme-toggle.script';

export const ThemeToggle: EcoComponent<RadiantSwitchProps> = (props) => {
	return <theme-toggle class="radiant-switch" {...props} />;
};

ThemeToggle.config = {
	dependencies: {
		stylesheets: ['../switch/switch.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
};
