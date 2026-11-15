import { eco } from '@ecopages/core';

/**
 * Plain Kita theme toggle, so layouts that render it ship no React.
 *
 * @remarks
 * Carries the markup contract only (`#theme-toggle`, `data-theme-toggle-runtime="dom"`). The click handling
 * and the `theme` storage key live in the `theme-bootstrap` script of the HTML template, which delegates
 * from `document`, so the toggle needs no script of its own and works before and after client navigation.
 */
export const ThemeToggle = eco.component({
	render: () => (
		<button
			id="theme-toggle"
			type="button"
			class="button"
			title="Toggle theme"
			aria-label="Toggle theme"
			data-testid="theme-toggle"
			data-theme-toggle-runtime="dom"
		>
			<span class="dark-hidden dark:hidden">Dark Mode</span>
			<span class="light-hidden hidden dark:inline">Light Mode</span>
		</button>
	),
});
