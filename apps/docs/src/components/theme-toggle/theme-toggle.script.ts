import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { RadiantSwitch, type RadiantSwitchProps } from '../switch/switch.script';

@customElement('theme-toggle')
export class ThemeToggle extends RadiantSwitch {
	override connectedCallback(): void {
		super.connectedCallback();
		this.initTheme();

		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			if (!localStorage.getItem('theme')) {
				this.checked = e.matches;
				this.updateDocumentClass(e.matches);
			}
		});

		this.addEventListener('change', () => this.handleThemeChange());
	}

	handleThemeChange() {
		const isDark = this.checked;
		const theme = isDark ? 'dark' : 'light';
		localStorage.setItem('theme', theme);
		this.updateDocumentClass(isDark);

		window.dispatchEvent(
			new CustomEvent('eco:theme-change', {
				detail: { theme, isDark },
			}),
		);
	}

	initTheme() {
		const storedTheme = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = storedTheme ? storedTheme === 'dark' : prefersDark;

		this.checked = isDark;
		this.updateDocumentClass(isDark);
	}

	updateDocumentClass(isDark: boolean) {
		const theme = isDark ? 'dark' : 'light';
		document.documentElement.setAttribute('data-theme', theme);
		document.documentElement.classList.toggle('dark', isDark);
	}

	@onEvent({ window: true, type: 'eco:theme-change' })
	onThemeChange(event: CustomEvent) {
		const { isDark } = event.detail;
		if (this.checked !== isDark) {
			this.checked = isDark;
			this.updateDocumentClass(isDark);
		}
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'theme-toggle': RadiantSwitchProps & HtmlTag;
		}
	}
}
