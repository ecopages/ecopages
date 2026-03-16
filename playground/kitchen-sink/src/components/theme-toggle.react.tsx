/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { JSX } from 'react';

export const ThemeToggleReact = eco.component<{}, JSX.Element>({
	integration: 'react',
	render: () => {
		const toggleTheme = () => {
			const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

			if (isDark) {
				document.documentElement.removeAttribute('data-theme');
				localStorage.setItem('theme', 'light');
				return;
			}

			document.documentElement.setAttribute('data-theme', 'dark');
			localStorage.setItem('theme', 'dark');
		};

		return (
			<button
				id="theme-toggle"
				className="button"
				type="button"
				title="Toggle theme"
				aria-label="Toggle theme"
				onClick={toggleTheme}
			>
				<span className="dark-hidden dark:hidden">Dark Mode</span>
				<span className="light-hidden hidden dark:inline">Light Mode</span>
			</button>
		);
	},
});
