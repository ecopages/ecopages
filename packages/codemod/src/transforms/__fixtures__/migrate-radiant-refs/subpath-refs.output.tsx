import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { ref } from '@ecopages/radiant/decorators/ref';

export class Toast extends RadiantElement {
	@ref('toast') toastTarget!: HTMLElement | null;
	@ref() closeButton!: HTMLButtonElement | null;
}
