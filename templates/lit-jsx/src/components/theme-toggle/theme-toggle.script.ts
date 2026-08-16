const PREFERENCES = ['system', 'light', 'dark'] as const;
type ThemePreference = (typeof PREFERENCES)[number];
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const toggles = document.querySelectorAll<HTMLElement>('theme-toggle');

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
		const text = preference[0].toUpperCase() + preference.slice(1);
		toggle.querySelector('[data-theme-toggle]')?.setAttribute('aria-label', `Theme: ${text}`);
		const label = toggle.querySelector('.theme-toggle-button__label');
		if (label) label.textContent = text;
	}
}

const stored = localStorage.getItem('theme') as ThemePreference | null;
let preference: ThemePreference = stored && PREFERENCES.includes(stored) ? stored : 'system';
update(preference);
for (const toggle of toggles) {
	toggle.querySelector('button')?.addEventListener('click', () => {
		preference = PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length];
		update(preference);
	});
}
