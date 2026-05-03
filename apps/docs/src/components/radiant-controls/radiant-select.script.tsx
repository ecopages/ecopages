import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import {
	createControlInstanceId,
	type RadiantSelectOption,
	type RadiantValueChangeEvent,
} from './radiant-controls.shared';

@customElement('radiant-select')
export class RadiantSelect extends RadiantElement {
	private readonly instanceId = createControlInstanceId('radiant-select');

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
		const controlId = this.id ? `${this.id}-input` : `${this.instanceId}-input`;
		const labelId = this.id ? `${this.id}-label` : `${this.instanceId}-label`;
		const descriptionId = this.id ? `${this.id}-description` : `${this.instanceId}-description`;
		const hasDescription = Boolean(this.description);
		return (
			<div class="radiant-control">
				<label class="radiant-control__label" id={labelId} for={controlId}>
					{this.label}
				</label>
				<select
					id={controlId}
					class="radiant-control__input radiant-control__select"
					name={this.name}
					aria-label={this.ariaLabel || undefined}
					aria-labelledby={this.ariaLabel ? undefined : labelId}
					aria-describedby={hasDescription ? descriptionId : undefined}
					on:change={this.handleChange}
				>
					{this.controlOptions.map((option) => (
						<option key={option.id} value={option.id} selected={option.id === this.value}>
							{option.label}
						</option>
					))}
				</select>
				{hasDescription ? (
					<div class="radiant-control__description" id={descriptionId}>
						{this.description}
					</div>
				) : null}
			</div>
		);
	}
}
