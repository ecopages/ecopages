import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { prop } from '@ecopages/radiant/decorators/prop';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import {
	createFieldIds,
	ensureFieldId,
	type RadiantFieldProps,
	type RadiantOption,
	type RadiantValueChangeEvent,
} from '../radiant-field/field.shared';

export type RadiantToggleGroupProps = RadiantFieldProps & {
	name?: string;
	options?: RadiantOption[];
	value?: string;
	disabled?: boolean;
};

@customElement('radiant-toggle-group')
export class RadiantToggleGroup extends RadiantElement {
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
		const baseId = ensureFieldId(this, 'radiant-toggle-group');
		const radioGroupName = this.name ? `${this.name}-${baseId}` : `${baseId}-group`;
		const { descriptionId } = createFieldIds(baseId);
		const hasDescription = Boolean(this.description);

		return (
			<fieldset
				data-slot="group"
				class="radiant-toggle-group__group"
				disabled={this.disabled ? 'true' : undefined}
				aria-label={this.ariaLabel || undefined}
				aria-describedby={hasDescription ? descriptionId : undefined}
			>
				<legend data-slot="label" class="radiant-toggle-group__label">
					{this.label}
				</legend>
				<div data-slot="body" class="radiant-toggle-group__body">
					<div data-slot="options" class="radiant-toggle-group__options">
						{this.controlOptions.map((option) => (
							<label key={option.id} data-slot="option" class="radiant-toggle-group__option">
								<input
									data-slot="option-input"
									type="radio"
									name={radioGroupName}
									value={option.id}
									checked={option.id === this.value}
									disabled={this.disabled ? 'true' : undefined}
									on:change={this.handleChange}
								/>
								<span data-slot="option-label" class="radiant-toggle-group__option-label">
									{option.label}
								</span>
							</label>
						))}
					</div>
					{hasDescription ? (
						<div data-slot="description" class="radiant-toggle-group__description" id={descriptionId}>
							{this.description}
						</div>
					) : null}
				</div>
			</fieldset>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-toggle-group': JsxCustomElementAttributes<RadiantToggleGroup, RadiantToggleGroupProps>;
	}
}
