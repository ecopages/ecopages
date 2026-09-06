import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import './theme-toggle.css';

function SystemIcon(): ReactNode {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect width="20" height="14" x="2" y="3" rx="2" />
			<line x1="8" x2="16" y1="21" y2="21" />
			<line x1="12" x2="12" y1="17" y2="21" />
		</svg>
	);
}

export const ThemeToggle = eco.component<Record<string, never>, ReactNode>({
	dependencies: {
		scripts: ['./theme-toggle.script.ts'],
	},
	render: () => (
		<div className="theme-toggle" data-value="system">
			<button type="button" className="theme-toggle-button" data-theme-toggle aria-label="Theme: System">
				<span className="theme-toggle-button__icon">
					<SystemIcon />
				</span>
				<span className="theme-toggle-button__label">System</span>
			</button>
		</div>
	),
});
