import type { EcoComponent } from '@ecopages/core';
import type { RadiantSelectProps as SelectProps } from './select.script';
import './select.script';

export const RadiantSelect: EcoComponent<SelectProps> = (props) => {
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
};

RadiantSelect.config = {
	dependencies: {
		stylesheets: ['../radiant-field/field.css', './select.css'],
		scripts: ['./select.script.tsx'],
	},
};
