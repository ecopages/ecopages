import { useEffect } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function isThemePreference(value: string | null): value is ThemePreference {
	return value === 'system' || value === 'light' || value === 'dark';
}

function getSystemTheme(): ResolvedTheme {
	return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
	return preference === 'system' ? getSystemTheme() : preference;
}

function applyResolvedTheme(resolved: ResolvedTheme): void {
	const root = document.documentElement;
	root.classList.toggle('dark', resolved === 'dark');
	root.setAttribute('data-theme', resolved);
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	if (target.isContentEditable) {
		return true;
	}
	return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * Applies the stored theme preference and toggles light/dark when `d` is pressed.
 *
 * @remarks
 * Matches the shadcn app-template shortcut: `d` leaves `system` and flips between
 * `light` and `dark`. The Html blocking script still applies the first paint to
 * avoid a flash. This hook only runs after hydration.
 */
export function useThemeHotkey(): void {
	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		let preference: ThemePreference = isThemePreference(stored) ? stored : 'system';

		const applyPreference = (next: ThemePreference): void => {
			preference = next;
			applyResolvedTheme(resolveTheme(next));
			localStorage.setItem(STORAGE_KEY, next);
		};

		applyPreference(preference);

		const media = window.matchMedia(COLOR_SCHEME_QUERY);
		const onMediaChange = (): void => {
			if (preference === 'system') {
				applyResolvedTheme(getSystemTheme());
			}
		};
		media.addEventListener('change', onMediaChange);

		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (isEditableTarget(event.target)) {
				return;
			}
			if (event.key.toLowerCase() !== 'd') {
				return;
			}
			const resolved = resolveTheme(preference);
			applyPreference(resolved === 'dark' ? 'light' : 'dark');
		};

		const onStorage = (event: StorageEvent): void => {
			if (event.storageArea !== localStorage || event.key !== STORAGE_KEY) {
				return;
			}
			applyPreference(isThemePreference(event.newValue) ? event.newValue : 'system');
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('storage', onStorage);
		return () => {
			media.removeEventListener('change', onMediaChange);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('storage', onStorage);
		};
	}, []);
}
