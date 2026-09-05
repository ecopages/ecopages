import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { ThemePreference, ThemeToggleProps } from './theme-toggle.script';

export type ThemeToggleViewProps = ThemeToggleProps;

/**
 * The light-DOM contract `<theme-toggle>` drives: a button it listens to, and a
 * label it writes the current preference into. The element only queries these
 * refs — it never renders markup — which is the Radiant host model in one file.
 */
export const ThemeToggle = eco.component<ThemeToggleViewProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
	render: ({ value = 'system' }: { value?: ThemePreference }) => (
		<theme-toggle value={value}>
			<button type="button" data-ref="button" class="theme-toggle__button" aria-label="Change theme">
				<span class="theme-toggle__dot" aria-hidden="true"></span>
				<span data-ref="label" class="theme-toggle__label">
					{value}
				</span>
			</button>
		</theme-toggle>
	),
});
