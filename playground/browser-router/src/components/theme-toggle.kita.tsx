import type { EcoComponent } from '@ecopages/core';
import { Moon, Sun } from './icons.kita';

export const ThemeToggle: EcoComponent<object> = () => {
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
};

ThemeToggle.config = {
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
};
