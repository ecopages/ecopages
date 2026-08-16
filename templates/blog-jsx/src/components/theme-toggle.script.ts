import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { RadiantElement } from '@ecopages/radiant';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';

@customElement('theme-toggle')
export class ThemeToggleElement extends RadiantElement {
	override connectedCallback(): void {
		super.connectedCallback();
		this.initTheme();
		this.addEventListener('click', this.handleClick.bind(this));
	}

	handleClick() {
		const isDark = document.documentElement.classList.contains('dark');
		const next = !isDark;
		this.updateTheme(next);
		localStorage.setItem('theme', next ? 'dark' : 'light');
	}

	initTheme() {
		const storedTheme = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = storedTheme ? storedTheme === 'dark' : prefersDark;
		this.updateTheme(isDark);
	}

	updateTheme(isDark: boolean) {
		document.documentElement.classList.toggle('dark', isDark);
		document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
		this.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'theme-toggle': JsxCustomElementAttributes<ThemeToggleElement>;
	}
}
