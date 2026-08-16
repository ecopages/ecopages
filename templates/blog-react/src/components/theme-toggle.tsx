import { eco } from '@ecopages/core';
import { type ReactNode, useEffect, useState } from 'react';
import { Moon, Sun } from './icons';

/**
 * Theme toggle button that switches between light and dark modes.
 * Uses a mounted state to prevent hydration mismatches since the theme
 * is determined client-side from the DOM/localStorage.
 */
export const ThemeToggle = eco.component<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
	},

	render: () => {
		const [mounted, setMounted] = useState(false);
		const [isDark, setIsDark] = useState(false);

		useEffect(() => {
			const isDarkTheme = document.documentElement.classList.contains('dark');
			setIsDark(isDarkTheme);
			setMounted(true);
		}, []);

		const toggle = () => {
			const next = !isDark;
			setIsDark(next);
			document.documentElement.classList.toggle('dark', next);
			document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
			localStorage.setItem('theme', next ? 'dark' : 'light');
		};

		if (!mounted) {
			return (
				<button type="button" aria-label="Toggle theme" className="theme-toggle">
					<span style={{ width: 18, height: 18 }} />
				</button>
			);
		}

		return (
			<button
				type="button"
				onClick={toggle}
				aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
				className="theme-toggle"
			>
				{isDark ? <Sun size={18} /> : <Moon size={18} />}
			</button>
		);
	},
});
