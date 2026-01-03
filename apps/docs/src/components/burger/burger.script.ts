import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { debounce } from '@ecopages/radiant/decorators/debounce';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { query } from '@ecopages/radiant/decorators/query';
import { BurgerEvents } from '@/components/burger/burger.events';

@customElement('radiant-burger')
export class RadiantBurger extends RadiantElement {
	@query({ selector: 'button' }) burger!: HTMLButtonElement;

	@onEvent({ selector: 'button', type: 'click' })
	toggleMenu() {
		this.burger.toggleAttribute('aria-expanded');
		const isExpanded = this.burger.hasAttribute('aria-expanded');

		window.dispatchEvent(new CustomEvent(BurgerEvents.TOGGLE_MENU));
		document.body.classList.toggle('overflow-hidden', isExpanded);

		if (isExpanded) {
			window.addEventListener('resize', this.onResizeReset, { once: true });
		}
	}

	@onEvent({ window: true, type: 'resize' })
	@debounce(200)
	onResizeReset() {
		this.burger.removeAttribute('aria-expanded');
		document.body.classList.remove('overflow-hidden');
		window.dispatchEvent(new CustomEvent(BurgerEvents.CLOSE_MENU));
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-burger': HtmlTag;
		}
	}
}
