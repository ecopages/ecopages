import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { ThemeToggleProps } from './theme-toggle.script';
import './theme-toggle.script';

export type ThemeToggleViewProps = ThemeToggleProps & {
	/** Visible or screen-reader label for the switch. Default: `Theme`. */
	label?: string;
	/** When true, the label is only exposed to assistive tech. Default: `true`. */
	hiddenLabel?: boolean;
};

export const ThemeToggle = eco.component<ThemeToggleViewProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
	render: ({ label = 'Theme', hiddenLabel = true, ...props }) => {
		return <theme-toggle {...props}>{hiddenLabel ? <span class="sr-only">{label}</span> : label}</theme-toggle>;
	},
});
