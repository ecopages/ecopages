import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiCycleToggleButton,
	RuiCycleToggleItem,
	ThemePreferenceItemContent,
} from '@ecopages/radiant-ui/cycle-toggle';
import type { ThemeToggleProps } from './theme-toggle.script';

export type ThemeToggleViewProps = ThemeToggleProps & {
	label?: string;
};

export const ThemeToggle = eco.component<ThemeToggleViewProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: [{ src: './theme-toggle.script.ts', ssr: true }],
	},
	render: ({ label = 'Theme', value = 'system', variant = 'ghost', size = 'sm', disabled, ...props }) => {
		const preference = value ?? 'system';

		return (
			<theme-toggle {...props} value={value} label={label} variant={variant} size={size} disabled={disabled}>
				<RuiCycleToggleButton variant={variant} size={size} disabled={disabled}>
					<RuiCycleToggleItem id="system" selected={preference === 'system'}>
						<ThemePreferenceItemContent preference="system" showLabel={false} />
					</RuiCycleToggleItem>
					<RuiCycleToggleItem id="light" selected={preference === 'light'}>
						<ThemePreferenceItemContent preference="light" showLabel={false} />
					</RuiCycleToggleItem>
					<RuiCycleToggleItem id="dark" selected={preference === 'dark'}>
						<ThemePreferenceItemContent preference="dark" showLabel={false} />
					</RuiCycleToggleItem>
				</RuiCycleToggleButton>
			</theme-toggle>
		);
	},
});
