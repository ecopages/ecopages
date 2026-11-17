import { RadiantElement, customElement, onEvent, prop, query, ref, refAll, queryAll } from '@ecopages/radiant';

@customElement('rui-slider')
export class RuiSlider extends RadiantElement {
	@prop({ type: Number }) value = 0;
	@ref('root') rootTarget: HTMLElement | null;
	@ref() providerCount!: HTMLElement | null;
	@ref('rangeTrack') rangeTrack: HTMLElement | null;
	@refAll('thumb') thumbs!: HTMLElement[];
	@refAll() menuItem!: HTMLElement[];
	@queryAll('input[type="radio"]') radioTargets: HTMLInputElement[];
	@query<HTMLAudioElement>('[data-audio]') private audio!: HTMLAudioElement | null;

	@onEvent({ ref: 'root', type: 'click' })
	select() {
		this.value += 1;
	}
}
