import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { RadiantElement, customElement, onEvent, query } from '@ecopages/radiant';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeChangeDetail = {
	theme: ThemePreference;
	isDark: boolean;
};

const THEME_TOGGLE_TAG = 'theme-toggle';
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_CHANGE_EVENT = 'eco:theme-change';
const STORAGE_KEY = 'theme';
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

function normalize(stored: string | null): ThemePreference {
	return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
	if (preference === 'dark') return true;
	if (preference === 'light') return false;
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia(DARK_THEME_QUERY).matches
		: false;
}

/**
 * `<theme-toggle>` — one button that cycles system → light → dark.
 *
 * @remarks
 * A small `RadiantElement` built from the pieces the framework gives you:
 * `@query` for the light-DOM targets it drives, `@onEvent` for the click, the
 * media query and the cross-instance sync event.
 *
 * Persists the preference in `localStorage`, mirrors `prefers-color-scheme`
 * while `system` is selected, and broadcasts `eco:theme-change` so a toggle
 * remounted by a client-side navigation picks up the current value.
 */
@customElement(THEME_TOGGLE_TAG)
export class ThemeToggle extends RadiantElement {
	@query({ ref: 'button' }) button!: HTMLButtonElement;
	@query({ ref: 'label' }) label!: HTMLElement;

	private preference: ThemePreference = 'system';

	protected override onConnected(): void {
		this.preference = normalize(localStorage.getItem(STORAGE_KEY));
		this.sync();
	}

	@onEvent({ ref: 'button', type: 'click' })
	onToggleClick() {
		const next = ORDER[(ORDER.indexOf(this.preference) + 1) % ORDER.length];
		this.preference = next;
		localStorage.setItem(STORAGE_KEY, next);
		this.sync();
		window.dispatchEvent(
			new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
				detail: { theme: next, isDark: resolveIsDark(next) },
			}),
		);
	}

	@onEvent({ mediaQuery: DARK_THEME_QUERY, type: 'change' })
	onSystemThemeChange() {
		if (this.preference === 'system') this.applyTheme();
	}

	@onEvent({ window: true, type: THEME_CHANGE_EVENT })
	onThemeChange(event: CustomEvent<ThemeChangeDetail>) {
		const preference = normalize(event.detail.theme);
		if (preference === this.preference) return;
		this.preference = preference;
		this.sync();
	}

	private sync() {
		this.setAttribute('value', this.preference);
		if (this.label) this.label.textContent = this.preference;
		this.button?.setAttribute('aria-label', `Theme: ${this.preference}. Activate to change.`);
		this.applyTheme();
	}

	private applyTheme() {
		const isDark = resolveIsDark(this.preference);
		document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
		document.documentElement.classList.toggle('dark', isDark);
	}
}

export type ThemeToggleProps = {
	value?: ThemePreference;
};

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'theme-toggle': JsxCustomElementAttributes<ThemeToggle, ThemeToggleProps>;
	}
}
