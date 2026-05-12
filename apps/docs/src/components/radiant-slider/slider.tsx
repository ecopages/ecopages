import type { EcoComponent } from '@ecopages/core';
import type { RadiantSliderProps as SliderProps } from './slider.script';
import './slider.script';

export const RadiantSlider: EcoComponent<SliderProps> = (props) => {
	return (
		<radiant-slider
			id={props.id}
			class={props.class}
			label={props.label}
			aria={{ label: props.ariaLabel }}
			description={props.description}
			min={props.min}
			max={props.max}
			step={props.step}
			value={props.value}
			unit={props.unit}
		/>
	);
};

RadiantSlider.config = {
	dependencies: {
		stylesheets: ['../radiant-field/field.css', './slider.css'],
		scripts: ['./slider.script.tsx'],
	},
};