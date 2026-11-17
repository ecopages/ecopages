import { RadiantElement, customElement, onEvent, prop, query } from '@ecopages/radiant';

@customElement('rui-slider')
export class RuiSlider extends RadiantElement {
	@prop({ type: Number }) value = 0;
	@query({ ref: 'root' }) rootTarget: HTMLElement | null;
	@query({ ref: 'provider-count' }) providerCount!: HTMLElement | null;
	@query({ ref: 'rangeTrack' }) rangeTrack: HTMLElement | null;
	@query({ ref: 'thumb', all: true }) thumbs!: HTMLElement[];
	@query({ ref: 'menu-item', all: true }) menuItem!: HTMLElement[];
	@query({ selector: 'input[type="radio"]', all: true, cache: false }) radioTargets: HTMLInputElement[];
	@query<HTMLAudioElement>({ selector: '[data-audio]' }) private audio!: HTMLAudioElement | null;

	@onEvent({ ref: 'root', type: 'click' })
	select() {
		this.value += 1;
	}
}
