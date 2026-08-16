import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiCycleToggleButton,
	RuiCycleToggleItem,
	ThemeItemLabel,
	ThemePreferenceIcon,
} from '@ecopages/radiant-ui/cycle-toggle';
import type { ThemePreference } from '@ecopages/radiant-ui/cycle-toggle';
import type { ThemeToggleProps } from './theme-toggle.script';
import './theme-toggle.script';

export type ThemeToggleViewProps = ThemeToggleProps & {
	label?: string;
};

function ThemeToggleItemContent({ preference }: { preference: ThemePreference }): JsxRenderable {
	return (
		<span class="theme-toggle__item-content">
			<ThemePreferenceIcon preference={preference} />
			<ThemeItemLabel preference={preference} />
		</span>
	);
}

export const ThemeToggle = eco.component<ThemeToggleViewProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./theme-toggle.css'],
		scripts: ['./theme-toggle.script.ts'],
	},
	render: ({ label = 'Theme', value = 'system', variant = 'ghost', size = 'sm', disabled, ...props }) => {
		const preference = value ?? 'system';

		return (
			<theme-toggle {...props} value={value} label={label} variant={variant} size={size} disabled={disabled}>
				<RuiCycleToggleButton variant={variant} size={size} disabled={disabled}>
					<RuiCycleToggleItem id="system" selected={preference === 'system'}>
						<ThemeToggleItemContent preference="system" />
					</RuiCycleToggleItem>
					<RuiCycleToggleItem id="light" selected={preference === 'light'}>
						<ThemeToggleItemContent preference="light" />
					</RuiCycleToggleItem>
					<RuiCycleToggleItem id="dark" selected={preference === 'dark'}>
						<ThemeToggleItemContent preference="dark" />
					</RuiCycleToggleItem>
				</RuiCycleToggleButton>
			</theme-toggle>
		);
	},
});
