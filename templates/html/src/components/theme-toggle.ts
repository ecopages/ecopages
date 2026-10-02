const TAG = 'theme-toggle';
const STORAGE_KEY = 'theme';
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const PREFERENCES = ['system', 'light', 'dark'] as const;

type ThemePreference = (typeof PREFERENCES)[number];

function normalizePreference(value: string | null): ThemePreference {
	return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
	if (preference === 'dark') return true;
	if (preference === 'light') return false;
	return window.matchMedia(DARK_THEME_QUERY).matches;
}

function applyTheme(preference: ThemePreference) {
	const isDark = resolveIsDark(preference);
	document.documentElement.classList.toggle('dark', isDark);
	document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function themeLabel(preference: ThemePreference): string {
	if (preference === 'system') return 'System';
	if (preference === 'light') return 'Light';
	return 'Dark';
}

class ThemeToggleElement extends HTMLElement {
	private preference: ThemePreference = 'system';

	connectedCallback() {
		this.preference = normalizePreference(localStorage.getItem(STORAGE_KEY));
		this.setAttribute('data-value', this.preference);
		applyTheme(this.preference);
		this.updateButton();

		const button = this.querySelector('button');
		button?.addEventListener('click', () => this.cycle());

		window.matchMedia(DARK_THEME_QUERY).addEventListener('change', () => {
			if (this.preference === 'system') {
				applyTheme('system');
				this.updateButton();
			}
		});
	}

	private cycle() {
		const nextIndex = (PREFERENCES.indexOf(this.preference) + 1) % PREFERENCES.length;
		this.preference = PREFERENCES[nextIndex];
		localStorage.setItem(STORAGE_KEY, this.preference);
		this.setAttribute('data-value', this.preference);
		applyTheme(this.preference);
		this.updateButton();
	}

	private updateButton() {
		const button = this.querySelector('button');
		if (!button) return;

		const iconContainer = button.querySelector('.theme-toggle-button__icon');
		const labelContainer = button.querySelector('.theme-toggle-button__label');
		if (!iconContainer || !labelContainer) return;

		const iconMap: Record<ThemePreference, string> = {
			system: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>',
			light: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
			dark: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
		};

		iconContainer.innerHTML = iconMap[this.preference];
		labelContainer.textContent = themeLabel(this.preference);
	}
}

if (!customElements.get(TAG)) {
	customElements.define(TAG, ThemeToggleElement);
}
