import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Moon, Sun } from './icons';

export const ThemeToggle = eco.component<Record<string, never>, JsxRenderable>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},

	render: () => {
		return (
			<theme-toggle class="theme-toggle" aria-label="Toggle theme" data-eco-persist="theme-toggle">
				<span class="theme-toggle-sun">
					<Sun size={18} />
				</span>
				<span class="theme-toggle-moon">
					<Moon size={18} />
				</span>
			</theme-toggle>
		);
	},
});
