import { RadiantComponent, customElement, prop } from '@ecopages/radiant';
import { createControlInstanceId, type RadiantNumberChangeEvent } from './radiant-controls.shared';

@customElement('radiant-slider')
export class RadiantSlider extends RadiantComponent {
	private readonly instanceId = createControlInstanceId('radiant-slider');

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
		const controlId = this.id ? `${this.id}-input` : `${this.instanceId}-input`;
		const labelId = this.id ? `${this.id}-label` : `${this.instanceId}-label`;
		const descriptionId = this.id ? `${this.id}-description` : `${this.instanceId}-description`;
		const hasDescription = Boolean(this.description);
		const suffix = this.unit;
		return (
			<div class="radiant-control">
				<label class="radiant-control__label" id={labelId} for={controlId}>
					{this.label}
				</label>
				<div class="radiant-control__header">
					<output class="radiant-control__value">{this.value.toFixed(2)}{suffix}</output>
				</div>
				<input
					id={controlId}
					class="radiant-control__range"
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
					<div class="radiant-control__description" id={descriptionId}>
						{this.description}
					</div>
				) : null}
			</div>
		);
	}
}