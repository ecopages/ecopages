import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { prop } from '@ecopages/radiant/decorators/prop';
import {
	createFieldIds,
	ensureFieldId,
	type RadiantFieldProps,
	type RadiantNumberChangeEvent,
} from '../radiant-field/field.shared';

export type RadiantSliderProps = RadiantFieldProps & {
	min?: number;
	max?: number;
	step?: number;
	value?: number;
	unit?: string;
};

@customElement('radiant-slider')
export class RadiantSlider extends RadiantElement {
	@prop({ type: String }) label: string = '';
	@prop({ type: String }) override ariaLabel: string = '';
	@prop({ type: String }) description: string = '';
	@prop({ type: Number }) min: number = 0;
	@prop({ type: Number }) max: number = 100;
	@prop({ type: Number }) step: number = 1;
	@prop({ type: Number }) value: number = 0;
	@prop({ type: String }) unit: string = '';

	private readonly handleInput = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		event.stopPropagation();

		this.dispatchEvent(
			new CustomEvent<RadiantNumberChangeEvent>('input', {
				detail: { value: Number(event.currentTarget.value) },
				bubbles: true,
			}),
		);
	};

	override render() {
		const baseId = ensureFieldId(this, 'radiant-slider');
		const { controlId, labelId, descriptionId } = createFieldIds(baseId);
		const hasDescription = Boolean(this.description);
		const suffix = this.unit;

		return (
			<>
				<label data-slot="label" class="radiant-slider__label" id={labelId} for={controlId}>
					{this.label}
				</label>
				<div data-slot="header" class="radiant-slider__header">
					<output data-slot="value" class="radiant-slider__value">
						{this.value.toFixed(2)}
						{suffix}
					</output>
				</div>
				<input
					id={controlId}
					data-slot="control"
					class="radiant-slider__control"
					type="range"
					min={String(this.min)}
					max={String(this.max)}
					step={String(this.step)}
					value={String(this.value)}
					aria-label={this.ariaLabel || undefined}
					aria-labelledby={this.ariaLabel ? undefined : labelId}
					aria-describedby={hasDescription ? descriptionId : undefined}
					aria-valuetext={`${this.value.toFixed(2)}${suffix}`}
					on:input={this.handleInput}
				/>
				{hasDescription ? (
					<div data-slot="description" class="radiant-slider__description" id={descriptionId}>
						{this.description}
					</div>
				) : null}
			</>
		);
	}
}