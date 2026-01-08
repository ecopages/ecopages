import type { EcoComponent } from '@ecopages/core';
import { type JSX, useEffect, useState } from 'react';
import { Moon, Sun } from './icons';

export const ThemeToggle: EcoComponent<unknown, JSX.Element> = () => {
	const [isDark, setIsDark] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		const isDarkTheme = document.documentElement.classList.contains('dark');
		setIsDark(isDarkTheme);
	}, []);

	const toggle = () => {
		const next = !isDark;
		setIsDark(next);
		document.documentElement.classList.toggle('dark', next);
		document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
		localStorage.setItem('theme', next ? 'dark' : 'light');
	};

	// Prevent hydration mismatch by rendering a placeholder or compatible initial state
	if (!mounted) {
		return <button type="button" className="theme-toggle" aria-label="Toggle theme" />;
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
};

ThemeToggle.config = {
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
	},
};
