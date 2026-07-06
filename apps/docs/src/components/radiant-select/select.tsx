import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { RadiantSelectProps as SelectProps } from './select.script';

export const RadiantSelect = eco.component({
	dependencies: {
		stylesheets: ['../radiant-field/field.css', './select.css'],
		scripts: ['./select.script.tsx'],
	},
	render(props: JsxCustomElementAttributes<HTMLElement, SelectProps>) {
		return (
			<radiant-select
				id={props.id}
				class={props.class}
				label={props.label}
				aria={{ label: props.ariaLabel }}
				description={props.description}
				name={props.name}
				options={props.options}
				value={props.value}
			/>
		);
	},
});
