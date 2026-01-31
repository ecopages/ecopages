import { eco } from '@ecopages/core';
import { Moon, Sun } from './icons.kita';

export const ThemeToggle = eco.component({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},

	render: () => {
		return (
			<theme-toggle class="theme-toggle" role="button" data-eco-persist="theme-toggle">
				<span class="theme-toggle-sun">
					<Sun size={20} />
				</span>
				<span class="theme-toggle-moon">
					<Moon size={20} />
				</span>
			</theme-toggle>
		);
	},
});
