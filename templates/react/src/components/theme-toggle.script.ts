const PREFERENCES = ['system', 'light', 'dark'] as const;
type ThemePreference = (typeof PREFERENCES)[number];
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const toggles = document.querySelectorAll<HTMLElement>('.theme-toggle');

function normalizePreference(value: string | null): ThemePreference {
	return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

function applyTheme(preference: ThemePreference): void {
	const dark = preference === 'dark' || (preference === 'system' && window.matchMedia(DARK_THEME_QUERY).matches);
	document.documentElement.classList.toggle('dark', dark);
	document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function update(preference: ThemePreference): void {
	applyTheme(preference);
	localStorage.setItem('theme', preference);
	for (const toggle of toggles) {
		toggle.dataset.value = preference;
		const button = toggle.querySelector<HTMLButtonElement>('[data-theme-toggle]');
		const label = toggle.querySelector<HTMLElement>('.theme-toggle-button__label');
		const text = preference[0].toUpperCase() + preference.slice(1);
		button?.setAttribute('aria-label', `Theme: ${text}`);
		if (label) label.textContent = text;
	}
}

let preference = normalizePreference(localStorage.getItem('theme'));
update(preference);
for (const toggle of toggles) {
	toggle.querySelector('button')?.addEventListener('click', () => {
		preference = PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length];
		update(preference);
	});
}
