import type { EcoComponent } from '@ecopages/core';
import type { RadiantToggleGroupProps as ToggleGroupProps } from './toggle-group.script';
import './toggle-group.script';

export const RadiantToggleGroup: EcoComponent<ToggleGroupProps> = (props) => {
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
};

RadiantToggleGroup.config = {
	dependencies: {
		stylesheets: ['../radiant-field/field.css', './toggle-group.css'],
		scripts: ['./toggle-group.script.tsx'],
	},
};
