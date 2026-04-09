/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { JSX } from 'react';

const THEME_TOGGLE_MARKUP = `<button id="theme-toggle" class="button" type="button" title="Toggle theme" aria-label="Toggle theme" data-theme-toggle-runtime="dom"><span class="dark-hidden dark:hidden">Dark Mode</span><span class="light-hidden hidden dark:inline">Light Mode</span></button>`;

/**
 * React-owned theme toggle shell that delegates all runtime behavior to the
 * shared document-level theme script.
 */
export const ThemeToggleReact = eco.component<{}, JSX.Element>({
	integration: 'react',
	render: () => <span dangerouslySetInnerHTML={{ __html: THEME_TOGGLE_MARKUP }} />,
});
