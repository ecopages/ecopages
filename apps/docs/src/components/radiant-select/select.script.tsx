import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { prop } from '@ecopages/radiant/decorators/prop';
import {
	createFieldIds,
	ensureFieldId,
	type RadiantFieldProps,
	type RadiantSelectOption,
	type RadiantValueChangeEvent,
} from '../radiant-field/field.shared';

export type RadiantSelectProps = RadiantFieldProps & {
	name?: string;
	options?: RadiantSelectOption[];
	value?: string;
};

@customElement('radiant-select')
export class RadiantSelect extends RadiantElement {
	@prop({ type: String }) label: string = '';
	@prop({ type: String }) override ariaLabel: string = '';
	@prop({ type: String }) description: string = '';
	@prop({ type: String }) name: string = '';
	@prop({ type: Array }) options: RadiantSelectOption[] = [];
	@prop({ type: String }) value: string = '';

	private get controlOptions(): RadiantSelectOption[] {
		return this.options ?? [];
	}

	private readonly handleChange = (event: Event & { readonly currentTarget: HTMLSelectElement }) => {
		event.stopPropagation();

		this.dispatchEvent(
			new CustomEvent<RadiantValueChangeEvent>('change', {
				detail: { value: event.currentTarget.value },
				bubbles: true,
			}),
		);
	};

	override render() {
		const baseId = ensureFieldId(this, 'radiant-select');
		const { controlId, labelId, descriptionId } = createFieldIds(baseId);
		const hasDescription = Boolean(this.description);

		return (
			<>
				<label data-slot="label" class="radiant-select__label" id={labelId} for={controlId}>
					{this.label}
				</label>
				<select
					id={controlId}
					data-slot="control"
					class="radiant-select__control"
					name={this.name}
					aria-label={this.ariaLabel || undefined}
					aria-labelledby={this.ariaLabel ? undefined : labelId}
					aria-describedby={hasDescription ? descriptionId : undefined}
					on:change={this.handleChange}
				>
					{this.controlOptions.map((option) => (
						<option key={option.id} value={option.id} selected={option.id === this.value} disabled={option.disabled}>
							{option.label}
						</option>
					))}
				</select>
				{hasDescription ? (
					<div data-slot="description" class="radiant-select__description" id={descriptionId}>
						{this.description}
					</div>
				) : null}
			</>
		);
	}
}