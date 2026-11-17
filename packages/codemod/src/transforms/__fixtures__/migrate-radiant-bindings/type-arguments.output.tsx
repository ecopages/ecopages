import { RadiantElement, prop, state } from '@ecopages/radiant';
import type { SharedBindings } from './bindings';

type CardBindings = {
	count: number;
};

export class InlineArgument extends RadiantElement<{ label: string; count: number }> {
	@state label = 'Hello';
	@prop({ type: Number }) count = 1;

	override render() {
		return (
			<p>
				{this.$.label} {this.$.count}
			</p>
		);
	}
}

export class NamedArgument extends RadiantElement<CardBindings> {
	@prop({ type: Number }) count = 1;

	override render() {
		return <p>{this.$.count}</p>;
	}
}

export class ImportedArgument extends RadiantElement<SharedBindings & { count: number; flag: boolean }> {
	@prop({ type: Number }) count = -1;
	@state flag = false;

	override render() {
		return (
			<p>
				{this.$.count} {this.$.flag}
			</p>
		);
	}
}
