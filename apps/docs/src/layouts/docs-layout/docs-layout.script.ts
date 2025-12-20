import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { BurgerEvents } from '@/components/burger/burger.events';
import type { RadiantSwitchEvent } from '@/components/switch/switch.script';
import '@ecopages/scripts-injector';

document.addEventListener('DOMContentLoaded', () => {
	const darkModeToggle = document.querySelector('#toggle-dark-mode') as HTMLInputElement;
	if (darkModeToggle) {
		const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
		const storedTheme = localStorage.getItem('theme');

		darkModeToggle.checked = storedTheme ? storedTheme === 'dark' : prefersDarkScheme.matches;

		const setTheme = (isDark: boolean) => {
			const theme = isDark ? 'dark' : 'light';
			document.documentElement.setAttribute('data-theme', theme);
			if (isDark) document.documentElement.classList.add('dark');
			else document.documentElement.classList.remove('dark');

			localStorage.setItem('theme', theme);
		};

		setTheme(darkModeToggle.checked);

		darkModeToggle.addEventListener('change', (event) => {
			const customEvent = event as CustomEvent<RadiantSwitchEvent>;
			setTheme(customEvent.detail.checked);
		});

		prefersDarkScheme.addEventListener('change', (event) => {
			if (!localStorage.getItem('theme')) {
				darkModeToggle.checked = event.matches;
				setTheme(event.matches);
			}
		});
	}
});

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
				// Scroll into view if needed
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
