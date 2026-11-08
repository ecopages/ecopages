import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Monitor, Moon, Sun } from './icons';
import { button, icon } from './theme-toggle.module.css';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ThemeToggleProps = {
	value?: ThemePreference;
};

function ThemeIcon({ preference }: { preference: ThemePreference }): JsxRenderable {
	if (preference === 'system') return <Monitor size={16} />;
	if (preference === 'light') return <Sun size={16} />;
	return <Moon size={16} />;
}

function ThemeLabel({ preference }: { preference: ThemePreference }): string {
	switch (preference) {
		case 'system':
			return 'System';
		case 'light':
			return 'Light';
		case 'dark':
			return 'Dark';
		default:
			return 'System';
	}
}

export const ThemeToggle = eco.component<ThemeToggleProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './theme-toggle.script.ts', ssr: true }],
	},
	render: ({ value = 'system' }) => (
		<theme-toggle data-value={value}>
			<button type="button" class={button} aria-label="Cycle theme">
				<span class={icon} data-ref="icon" aria-hidden="true">
					<ThemeIcon preference={value} />
				</span>
				<span data-ref="label">{ThemeLabel({ preference: value })}</span>
			</button>
		</theme-toggle>
	),
});
