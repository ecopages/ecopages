import { eco, type EcoPagesElement } from '@ecopages/core';
import './theme-toggle.css';

export const ThemeToggle = eco.component<{}, EcoPagesElement>({
	dependencies: {
		scripts: ['./theme-toggle.script.ts'],
	},
	render: () => (
		<theme-toggle data-value="system">
			<button type="button" class="theme-toggle-button" data-theme-toggle aria-label="Theme: System">
				<span class="theme-toggle-button__icon">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect width="20" height="14" x="2" y="3" rx="2" />
						<line x1="8" x2="16" y1="21" y2="21" />
						<line x1="12" x2="12" y1="17" y2="21" />
					</svg>
				</span>
				<span class="theme-toggle-button__label">System</span>
			</button>
		</theme-toggle>
	),
});
