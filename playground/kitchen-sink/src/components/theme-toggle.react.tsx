/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { JSX } from 'react';

export const ThemeToggleReact = eco.component<{}, JSX.Element>({
	integration: 'react',
	render: () => (
		<button
			id="theme-toggle"
			type="button"
			className="button"
			title="Toggle theme"
			aria-label="Toggle theme"
			data-testid="theme-toggle"
			data-theme-toggle-runtime="dom"
		>
			<span className="dark-hidden dark:hidden">Dark Mode</span>
			<span className="light-hidden hidden dark:inline">Light Mode</span>
		</button>
	),
});
