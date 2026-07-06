import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { RadiantToggleGroupProps as ToggleGroupProps } from './toggle-group.script';

export const RadiantToggleGroup = eco.component({
	dependencies: {
		stylesheets: ['../radiant-field/field.css', './toggle-group.css'],
		scripts: ['./toggle-group.script.tsx'],
	},
	render(props: JsxCustomElementAttributes<HTMLElement, ToggleGroupProps>) {
		return (
			<radiant-toggle-group
				id={props.id}
				class={props.class}
				label={props.label}
				aria={{ label: props.ariaLabel }}
				description={props.description}
				name={props.name}
				options={props.options}
				value={props.value}
				disabled={props.disabled}
			/>
		);
	},
});
