import type { WritableSignal } from '@ecopages/signals';
import { RadiantController, RadiantElement, attr, customElement, prop, signal } from '@ecopages/radiant';
import { sharedCount } from './store';

@customElement('bind-options')
export class BindOptions extends RadiantElement {
	@prop({ type: Number, bind: true }) total = 0;
	@prop({ type: Number, bind: false }) silent = 0;
	@attr({ bind: 'modeBinding' }) mode?: string;
	@signal({ bind: true, source: sharedCount }) shared!: WritableSignal<number>;

	override render() {
		return (
			<p data-mode={this.modeBinding}>
				{this.$total} / {this.$shared}
			</p>
		);
	}
}

export class StepController extends RadiantController {
	constructor(host: Element) {
		super(host);
		this.createReactiveProp('step', { type: Number, bind: true });
		this.createReactiveField('draft', 'ready', { bind: 'draftBinding' });
	}

	declare step: number;

	override render() {
		return (
			<p>
				{this.$step} {this.draftBinding}
			</p>
		);
	}
}

class LegacyCounter extends RadiantElement<{ count: number }> {
	declare count: number;
	declare $count: unknown;

	override render() {
		return <b>{this.$count}</b>;
	}
}

signal({ bind: true, initial: 1 })(LegacyCounter.prototype, 'count');
customElement('legacy-counter')(LegacyCounter);
