import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { RadiantSwitch, type RadiantSwitchEvent, type RadiantSwitchProps } from '../switch/switch.script';

@customElement('theme-toggle')
export class ThemeToggle extends RadiantSwitch {
	private readonly _mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

	private readonly _onMediaQueryChange = (e: MediaQueryListEvent) => {
		if (!localStorage.getItem('theme')) {
			this.checked = e.matches;
			this.updateDocumentClass(e.matches);
		}
	};

	@onEvent({ ref: 'switch', type: 'click' })
	override toggle() {
		if (this.disabled) return;

		const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
		this.checked = !isDark;
		this.dispatchEvent(
			new CustomEvent<RadiantSwitchEvent>('change', {
				detail: { checked: this.checked },
				bubbles: true,
			}),
		);
		this.handleThemeChange();
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.initTheme();
		this._mediaQuery.addEventListener('change', this._onMediaQueryChange);
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this._mediaQuery.removeEventListener('change', this._onMediaQueryChange);
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
		const isDark = storedTheme ? storedTheme === 'dark' : this._mediaQuery.matches;

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
