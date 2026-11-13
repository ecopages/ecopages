import { eco, type LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiSidebarTrigger } from '@ecopages/radiant-ui/sidebar';
import { ShellIcon } from './shell-icon';
import { WindowHeader } from './window-header';
import { WorkspacePanel, type WorkspaceRoute } from './workspace-panel';
import './shell-layout.css';

interface ShellLayoutProps extends LayoutProps<JsxRenderable> {
	workspace?: WorkspaceRoute;
}

export const ShellLayout = eco.layout<JsxRenderable, ShellLayoutProps>({
	render: ({ children, locals, workspace }) => (
		<body>
			<div class={workspace ? 'workspace' : 'auth-window'}>
				<WindowHeader>
					{workspace && (
						<RuiSidebarTrigger controls="workspace-sidebar" size="sm">
							<ShellIcon name="sidebar" />
						</RuiSidebarTrigger>
					)}
				</WindowHeader>
				{workspace ? (
					<WorkspacePanel {...workspace} sidebarOpen={locals?.workspace?.sidebarOpen ?? true}>
						{children}
					</WorkspacePanel>
				) : (
					children
				)}
			</div>
		</body>
	),
});
