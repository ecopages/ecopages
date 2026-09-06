import { eco } from '@ecopages/core';
import { type ReactNode, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from './icons';
import './theme-toggle.css';

const PREFERENCES = ['system', 'light', 'dark'] as const;
type ThemePreference = (typeof PREFERENCES)[number];

const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const STORAGE_KEY = 'theme';

function normalizePreference(value: string | null): ThemePreference {
	return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
	if (preference === 'dark') return true;
	if (preference === 'light') return false;
	return window.matchMedia(DARK_THEME_QUERY).matches;
}

function applyTheme(preference: ThemePreference): void {
	const isDark = resolveIsDark(preference);
	document.documentElement.classList.toggle('dark', isDark);
	document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function preferenceLabel(preference: ThemePreference): string {
	return `${preference[0].toUpperCase()}${preference.slice(1)}`;
}

function PreferenceIcon({ preference }: { preference: ThemePreference }): ReactNode {
	if (preference === 'light') return <Sun size={18} />;
	if (preference === 'dark') return <Moon size={18} />;
	return <Monitor size={18} />;
}

/**
 * Cycles `system` → `light` → `dark`.
 *
 * @remarks
 * Preference is read from `localStorage` after mount to avoid hydration mismatch.
 * While `system` is selected, `prefers-color-scheme` updates the effective theme.
 */
export const ThemeToggle = eco.component<{}, ReactNode>({
	render: () => {
		const [mounted, setMounted] = useState(false);
		const [preference, setPreference] = useState<ThemePreference>('system');

		useEffect(() => {
			const next = normalizePreference(localStorage.getItem(STORAGE_KEY));
			setPreference(next);
			applyTheme(next);
			setMounted(true);
		}, []);

		useEffect(() => {
			if (!mounted || preference !== 'system') return;

			const media = window.matchMedia(DARK_THEME_QUERY);
			const onChange = () => applyTheme('system');
			media.addEventListener('change', onChange);
			return () => media.removeEventListener('change', onChange);
		}, [mounted, preference]);

		const cycle = () => {
			const next = PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length];
			setPreference(next);
			localStorage.setItem(STORAGE_KEY, next);
			applyTheme(next);
		};

		const label = preferenceLabel(preference);

		return (
			<button
				type="button"
				onClick={mounted ? cycle : undefined}
				aria-label={`Theme: ${label}`}
				className="theme-toggle"
			>
				<PreferenceIcon preference={preference} />
				<span className="theme-toggle__label">{label}</span>
			</button>
		);
	},
});
