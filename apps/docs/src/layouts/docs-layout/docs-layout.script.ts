import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { BurgerEvents } from '@/components/burger/burger.events';
import '@ecopages/scripts-injector';

@customElement('radiant-navigation')
export class RadiantCounter extends RadiantElement {
	override connectedCallback(): void {
		super.connectedCallback();
		this.highlightActiveLink();
	}

	highlightActiveLink(): void {
		const links = this.querySelectorAll<HTMLAnchorElement>('[data-nav-link]');
		const currentPath = window.location.pathname;

		links.forEach((link) => {
			if (link.pathname === currentPath) {
				link.classList.add('active');
				link.scrollIntoView({ block: 'nearest' });
			} else {
				link.classList.remove('active');
			}
		});
	}

	@onEvent({ window: true, type: BurgerEvents.TOGGLE_MENU })
	toggleNavigation(): void {
		this.classList.toggle('hidden');
	}

	@onEvent({ window: true, type: BurgerEvents.CLOSE_MENU })
	closeNavigation(): void {
		this.classList.add('hidden');
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-navigation': HtmlTag;
		}
	}
}
