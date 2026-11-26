import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { customElement, onEvent } from '@ecopages/radiant';
import {
	RuiCycleToggleElement,
	type ThemePreference,
	type RuiCycleToggleProps,
} from '@ecopages/radiant-ui/cycle-toggle';

type ThemeChangeDetail = {
	theme: ThemePreference;
	isDark: boolean;
};

const THEME_TOGGLE_TAG = 'theme-toggle';
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_CHANGE_EVENT = 'eco:theme-change';
const STORAGE_KEY = 'theme';

function normalizePreference(stored: string | null): ThemePreference {
	if (stored === 'light' || stored === 'dark' || stored === 'system') {
		return stored;
	}

	return 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
	if (preference === 'dark') {
		return true;
	}

	if (preference === 'light') {
		return false;
	}

	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia(DARK_THEME_QUERY).matches
		: false;
}

/**
 * @remarks
 * Persists `system` / `light` / `dark` in `localStorage`, mirrors `prefers-color-scheme`
 * while `system` is selected, and broadcasts `eco:theme-change` so remounted toggles stay in sync.
 */
@customElement(THEME_TOGGLE_TAG)
export class ThemeToggle extends RuiCycleToggleElement {
	override connectedCallback(): void {
		super.connectedCallback();
		this.syncWithStoredPreference();
	}

	@onEvent({ mediaQuery: DARK_THEME_QUERY, type: 'change' })
	onSystemThemeChange() {
		if (normalizePreference(this.value) !== 'system') return;
		this.applyEffectiveTheme();
	}

	@onEvent({ selector: THEME_TOGGLE_TAG, type: 'rui-change' })
	onCycleChange() {
		this.handlePreferenceChange();
	}

	@onEvent({ window: true, type: THEME_CHANGE_EVENT })
	onThemeChange(event: CustomEvent<ThemeChangeDetail>) {
		const { theme } = event.detail;
		const preference = normalizePreference(theme);
		if (normalizePreference(this.value) !== preference) {
			this.value = preference;
			this.resync();
		}
	}

	private handlePreferenceChange() {
		const preference = normalizePreference(this.value);
		localStorage.setItem(STORAGE_KEY, preference);
		this.applyEffectiveTheme();
		window.dispatchEvent(
			new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, {
				detail: { theme: preference, isDark: resolveIsDark(preference) },
			}),
		);
	}

	private syncWithStoredPreference() {
		const preference = normalizePreference(localStorage.getItem(STORAGE_KEY));
		this.value = preference;
		this.resync();
		this.applyEffectiveTheme();
	}

	private applyEffectiveTheme() {
		const preference = normalizePreference(this.value);
		const isDark = resolveIsDark(preference);
		const effective = isDark ? 'dark' : 'light';
		document.documentElement.setAttribute('data-theme', effective);
		document.documentElement.classList.toggle('dark', isDark);
	}
}

export type ThemeToggleProps = RuiCycleToggleProps & { id?: string };

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'theme-toggle': JsxCustomElementAttributes<ThemeToggle, ThemeToggleProps>;
	}
}
