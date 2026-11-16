import { RadiantElement, customElement, prop } from '@ecopages/radiant';

@customElement('migrated-card')
export class MigratedCard extends RadiantElement<{ count: number }> {
	@prop({ type: Number, defaultValue: 0 }) count!: number;
	private readonly $root = this.querySelector('div');

	override render() {
		return (
			<p data-root={String(this.$root)}>
				{this.$.count} {this.bindings.count}
			</p>
		);
	}
}
