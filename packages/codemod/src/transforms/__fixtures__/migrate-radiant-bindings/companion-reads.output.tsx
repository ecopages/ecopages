import { RadiantElement, customElement, prop, state } from '@ecopages/radiant';

@customElement('counter-card')
export class CounterCard extends RadiantElement<{ count: number; label: string; open: boolean | undefined }> {
	@prop({ type: Number, reflect: true, defaultValue: 0 }) count!: number;
	@state label = 'Count';
	@state open?: boolean;

	private readonly doubled = this.$.count.map((count) => count * 2);

	get summary() {
		return `${this.$.label.getValue()}: ${this.$.count.getValue()}`;
	}

	override render() {
		return (
			<p hidden={this.$.open}>
				{this.$.label}: {this.$.count} ({this.doubled})
			</p>
		);
	}
}
