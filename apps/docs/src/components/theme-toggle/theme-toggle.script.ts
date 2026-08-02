import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { customElement, onEvent } from '@ecopages/radiant';
import { RuiSwitchElement, type RuiSwitchProps } from '@ecopages/radiant-ui/switch';

type ThemeChangeDetail = {
	theme: 'dark' | 'light';
	isDark: boolean;
};

const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_CHANGE_EVENT = 'eco:theme-change';

@customElement('theme-toggle')
export class ThemeToggle extends RuiSwitchElement {
	private mediaQueryList: MediaQueryList | null = null;

	override connectedCallback(): void {
		super.connectedCallback();
		this.mediaQueryList = window.matchMedia(DARK_THEME_QUERY);
		this.syncWithThemePreference();
		this.mediaQueryList.addEventListener('change', this.handleSystemThemeChange);
		this.addEventListener('rui-change', this.handleToggleChange);
	}

	override disconnectedCallback(): void {
		this.mediaQueryList?.removeEventListener('change', this.handleSystemThemeChange);
		this.removeEventListener('rui-change', this.handleToggleChange);
		this.mediaQueryList = null;
		super.disconnectedCallback();
	}

	private readonly handleSystemThemeChange = (event: MediaQueryListEvent) => {
		if (localStorage.getItem('theme')) {
			return;
		}

		this.applyTheme(event.matches);
	};

	private readonly handleToggleChange = () => {
		this.handleThemeChange();
	};

	private handleThemeChange() {
		const isDark = this.checked;
		const theme = isDark ? 'dark' : 'light';
		localStorage.setItem('theme', theme);
		this.updateDocumentClass(isDark);

		window.dispatchEvent(
			new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
				detail: { theme, isDark },
			}),
		);
	}

	private syncWithThemePreference() {
		const storedTheme = localStorage.getItem('theme');
		const prefersDark = this.mediaQueryList?.matches ?? window.matchMedia(DARK_THEME_QUERY).matches;
		const isDark = storedTheme ? storedTheme === 'dark' : prefersDark;

		this.applyTheme(isDark);
	}

	private applyTheme(isDark: boolean) {
		this.checked = isDark;
		this.updateDocumentClass(isDark);
	}

	private updateDocumentClass(isDark: boolean) {
		const theme = isDark ? 'dark' : 'light';
		document.documentElement.setAttribute('data-theme', theme);
		document.documentElement.classList.toggle('dark', isDark);
	}

	@onEvent({ window: true, type: THEME_CHANGE_EVENT })
	onThemeChange(event: CustomEvent<ThemeChangeDetail>) {
		const { isDark } = event.detail;
		if (this.checked !== isDark) {
			this.applyTheme(isDark);
		}
	}
}

export type ThemeToggleProps = RuiSwitchProps & {
	id?: string;
};

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'theme-toggle': JsxCustomElementAttributes<ThemeToggle, ThemeToggleProps>;
	}
}
