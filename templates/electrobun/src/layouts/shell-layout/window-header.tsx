import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { desktop, insetControls } from '../../lib/settings';
import { ShellIcon } from './shell-icon';

const windowControls = [
	{ action: 'minimize', label: 'Minimize window' },
	{ action: 'maximize', label: 'Maximize or restore window' },
	{ action: 'close', label: 'Close window' },
] as const;

export const WindowHeader = eco.component<{ children?: JsxRenderable }, JsxRenderable>({
	dependencies: {
		scripts: [
			{ src: './window-header.script.ts', attributes: { 'data-eco-script-id': 'workspace-window-header' } },
		],
	},
	render: ({ children }) => (
		<header class="window-header electrobun-webkit-app-region-drag">
			<div class="window-header-controls electrobun-webkit-app-region-no-drag">
				{children}
				<RuiButton
					type="button"
					size="sm"
					variant="ghost"
					data-history="back"
					aria-label="Go back"
					title="Go back"
					disabled
				>
					<ShellIcon name="back" />
				</RuiButton>
				<RuiButton
					type="button"
					size="sm"
					variant="ghost"
					data-history="forward"
					aria-label="Go forward"
					title="Go forward"
					disabled
				>
					<ShellIcon name="forward" />
				</RuiButton>
			</div>
			<span class="window-title">Workspace</span>
			{desktop && !insetControls && (
				<div class="window-header-controls window-actions electrobun-webkit-app-region-no-drag">
					{windowControls.map(({ action, label }) => (
						<RuiButton
							type="button"
							size="sm"
							variant="ghost"
							aria-label={label}
							title={label}
							data-window-action={action}
						>
							<ShellIcon name={action} />
						</RuiButton>
					))}
				</div>
			)}
		</header>
	),
});
