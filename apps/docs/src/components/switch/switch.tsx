import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { RadiantSwitchProps } from './switch.script';

export const RadiantSwitch = eco.component({
	dependencies: {
		stylesheets: ['./switch.css'],
		scripts: ['./switch.script.tsx'],
	},
	render(props: JsxCustomElementAttributes<HTMLElement, RadiantSwitchProps>) {
		return <radiant-switch class="radiant-switch" {...props}></radiant-switch>;
	},
});
