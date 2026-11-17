import type { WritableSignal } from '@ecopages/signals';
import { RadiantController, RadiantElement, attr, customElement, prop, signal } from '@ecopages/radiant';
import { sharedCount } from './store';

@customElement('bind-options')
export class BindOptions extends RadiantElement<{ total: number; mode: string | undefined; shared: number }> {
	@prop({ type: Number }) total = 0;
	@prop({ type: Number }) silent = 0;
	@attr() mode?: string;
	@signal({ source: sharedCount }) shared!: WritableSignal<number>;

	override render() {
		return (
			<p data-mode={this.$.mode}>
				{this.$.total} / {this.$.shared}
			</p>
		);
	}
}

export class StepController extends RadiantController<{ step: number; draft: string }> {
	constructor(host: Element) {
		super(host);
		this.createReactiveProp('step', { type: Number });
		this.createReactiveField('draft', 'ready');
	}

	declare step: number;

	override render() {
		return (
			<p>
				{this.$.step} {this.$.draft}
			</p>
		);
	}
}

class LegacyCounter extends RadiantElement<{ count: number }> {
	declare count: number;

	override render() {
		return <b>{this.$.count}</b>;
	}
}

signal({ initial: 1 })(LegacyCounter.prototype, 'count');
customElement('legacy-counter')(LegacyCounter);
