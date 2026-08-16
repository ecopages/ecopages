import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Monitor, Moon, Sun } from './icons';

/**
 * Cycles `system` → `light` → `dark`.
 *
 * @remarks
 * Click handling lives in `theme-toggle.script.ts` so the control works even when
 * the React page tree has not hydrated (for example after a client-graph error).
 */
export const ThemeToggle = eco.component<Record<string, never>, ReactNode>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
	render: () => (
		<button type="button" className="theme-toggle" data-theme-toggle data-value="system" aria-label="Theme: System">
			<span className="theme-toggle__icon" data-theme-icon="system">
				<Monitor size={18} />
			</span>
			<span className="theme-toggle__icon" data-theme-icon="light">
				<Sun size={18} />
			</span>
			<span className="theme-toggle__icon" data-theme-icon="dark">
				<Moon size={18} />
			</span>
			<span className="theme-toggle__label">System</span>
		</button>
	),
});
