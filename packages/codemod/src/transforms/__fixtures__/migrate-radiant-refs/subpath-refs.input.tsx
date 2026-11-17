import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { query } from '@ecopages/radiant/decorators/query';

export class Toast extends RadiantElement {
	@query({ ref: 'toast' }) toastTarget!: HTMLElement | null;
	@query({ ref: 'close-button' }) closeButton!: HTMLButtonElement | null;
}
