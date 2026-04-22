import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { BurgerEvents } from '../../../../components/burger/burger.events';

@customElement('radiant-navigation')
export class RadiantNavigation extends RadiantElement {
	override connectedCallback(): void {
		super.connectedCallback();
		this.highlightActiveLink({ scrollToActiveLink: true });
	}

	@onEvent({ document: true, type: 'eco:page-load' })
	onPageLoad(): void {
		this.highlightActiveLink();
	}

	@onEvent({ document: true, type: 'eco:after-swap' })
	onAfterSwap(): void {
		this.highlightActiveLink();
	}

	highlightActiveLink(options?: { scrollToActiveLink?: boolean }): void {
		const links = this.querySelectorAll<HTMLAnchorElement>('[data-nav-link]');
		const currentPath = window.location.pathname;
		const shouldScroll = options?.scrollToActiveLink ?? false;

		links.forEach((link) => {
			if (link.pathname === currentPath) {
				link.classList.add('active');
				if (shouldScroll) {
					link.scrollIntoView({ block: 'nearest' });
				}
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