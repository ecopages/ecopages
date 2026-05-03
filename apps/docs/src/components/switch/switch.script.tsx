import { RadiantElement, customElement, prop } from '@ecopages/radiant';

export type RadiantSwitchProps = {
	id?: string;
	checked?: boolean;
	disabled?: boolean;
	label?: string;
	hiddenLabel?: boolean;
};

export type RadiantSwitchEvent = { checked: boolean };

type RadiantSwitchBindings = {
	checked: boolean;
	disabled: boolean;
};

@customElement('radiant-switch')
export class RadiantSwitch extends RadiantElement<RadiantSwitchBindings> {
	@prop({ type: Boolean, reflect: true, defaultValue: false }) declare checked: boolean;
	@prop({ type: Boolean, reflect: true, defaultValue: false }) declare disabled: boolean;
	@prop({ type: String, defaultValue: '' }) declare label: string;
	@prop({ type: Boolean, reflect: true, defaultValue: false }) declare hiddenLabel: boolean;

	protected dispatchCheckedChange(): void {
		this.dispatchEvent(
			new CustomEvent<RadiantSwitchEvent>('change', {
				detail: { checked: this.checked },
				bubbles: true,
			}),
		);
	}

	private readonly handleToggle = () => {
		if (this.disabled) {
			return;
		}

		this.checked = !this.checked;
		this.dispatchCheckedChange();
	};

	private getLabelId(): string | undefined {
		if (!this.label || !this.id) {
			return undefined;
		}

		return `${this.id}-label`;
	}

	override render() {
		const labelId = this.getLabelId();
		const ariaLabel = this.label ? (labelId ? undefined : this.label) : 'Toggle switch';

		return (
			<label class="switch-wrapper">
				{this.label ? (
					<span class={this.hiddenLabel ? 'sr-only' : 'label'} id={labelId}>
						{this.label}
					</span>
				) : null}
				<button
					type="button"
					class="switch"
					role="switch"
					aria-checked={this.$.checked}
					aria-labelledby={labelId}
					aria-label={ariaLabel}
					disabled={this.$.disabled}
					on:click={this.handleToggle}
				>
					<span class="thumb" aria-hidden="true"></span>
				</button>
			</label>
		);
	}
}
