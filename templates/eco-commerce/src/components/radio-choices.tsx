import type { JsxRenderable } from '@ecopages/jsx';
import { RuiRadioGroup, RuiRadioGroupControl } from '@ecopages/radiant-ui/radio-group';

export type RadioChoicesProps = {
	name: string;
	label: string;
	value: string | undefined;
	options: Array<{ value: string; label: string }>;
};

/**
 * A `RuiRadioGroup` whose server markup is already a working form field.
 *
 * @remarks
 * The radios are authored with the `rui-radio` markup the group expects, plus `name` and `checked`. Radiant UI
 * sets those from the group's `value` only once its script runs, so without them a visitor without JavaScript
 * would submit no value. The group takes them over on connect with the same name and value.
 */
export function RadioChoices({ name, label, value, options }: RadioChoicesProps): JsxRenderable {
	return (
		<RuiRadioGroup name={name} label={label} value={value}>
			<RuiRadioGroupControl>
				{options.map((option) => (
					<label class="rui-radio">
						<input
							class="rui-radio__input"
							type="radio"
							name={name}
							value={option.value}
							checked={option.value === value}
						/>
						<span class="rui-radio__control" aria-hidden="true" />
						<span class="rui-radio__label">{option.label}</span>
					</label>
				))}
			</RuiRadioGroupControl>
		</RuiRadioGroup>
	);
}
