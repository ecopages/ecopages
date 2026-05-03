import { RadiantElement, customElement, prop } from '@ecopages/radiant';
import { createControlInstanceId, type RadiantOption, type RadiantValueChangeEvent } from './radiant-controls.shared';

@customElement('radiant-toggle-selector')
export class RadiantToggleSelector extends RadiantElement {
	private readonly instanceId = createControlInstanceId('radiant-toggle-selector');

	@prop({ type: String }) label: string = '';
	@prop({ type: String }) override ariaLabel: string = '';
	@prop({ type: String }) description: string = '';
	@prop({ type: String }) name: string = '';
	@prop({ type: Array }) options: RadiantOption[] = [];
	@prop({ type: String }) value: string = '';
	@prop({ type: Boolean, reflect: true }) disabled: boolean = false;

	private get controlOptions(): RadiantOption[] {
		return this.options ?? [];
	}

	private readonly handleChange = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		event.stopPropagation();

		this.dispatchEvent(
			new CustomEvent<RadiantValueChangeEvent>('change', {
				detail: { value: event.currentTarget.value },
				bubbles: true,
			}),
		);
	};

	override render() {
		const radioGroupName = this.name ? `${this.name}-${this.instanceId}` : `${this.instanceId}-group`;
		const descriptionId = this.id ? `${this.id}-description` : `${this.instanceId}-description`;
		const hasDescription = Boolean(this.description);

		return (
			<fieldset
				class="radiant-control radiant-choice-group"
				disabled={this.disabled ? 'true' : undefined}
				aria-label={this.ariaLabel || undefined}
				aria-describedby={hasDescription ? descriptionId : undefined}
			>
				<legend class="radiant-control__legend">{this.label}</legend>
				<div class="radiant-control__body">
					<div class="radiant-choice-group__options">
						{this.controlOptions.map((option) => (
							<label key={option.id} class="radiant-choice">
								<input
									type="radio"
									name={radioGroupName}
									value={option.id}
									checked={option.id === this.value}
									disabled={this.disabled ? 'true' : undefined}
									on:change={this.handleChange}
								/>
								<span class="radiant-choice__label">{option.label}</span>
							</label>
						))}
					</div>
					{hasDescription ? (
						<div class="radiant-control__description" id={descriptionId}>
							{this.description}
						</div>
					) : null}
				</div>
			</fieldset>
		);
	}
}
