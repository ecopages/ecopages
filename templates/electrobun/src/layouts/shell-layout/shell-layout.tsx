import { eco, type EcoPageLayoutEntrySpec, type LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiSidebarTrigger } from '@ecopages/radiant-ui/sidebar';
import { ShellIcon } from './shell-icon';
import { WindowHeader } from './window-header';
import { WorkspacePanel, type WorkspaceRoute } from './workspace-panel';
import './shell-layout.css';

interface ShellLayoutProps extends LayoutProps<JsxRenderable> {
	workspace?: WorkspaceRoute;
	sidebarOpen?: boolean;
}

export const ShellLayout = eco.layout<JsxRenderable, ShellLayoutProps>({
	render: ({ children, workspace, sidebarOpen }) => (
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
					<WorkspacePanel {...workspace} sidebarOpen={sidebarOpen ?? true}>
						{children}
					</WorkspacePanel>
				) : (
					children
				)}
			</div>
		</body>
	),
});

type WorkspaceLocals = { workspace: { sidebarOpen: boolean } };

/**
 * Layout entry for a workspace page: the shell with its sidebar for `route`.
 *
 * @remarks
 * The sidebar state comes from `locals`, which `requireSession` provides, and reaches the layout as a prop. A Page
 * must list `requireSession` to use the entry.
 */
export function workspaceLayout(
	route: WorkspaceRoute,
): EcoPageLayoutEntrySpec<JsxRenderable, { locals: WorkspaceLocals }> {
	return {
		component: ShellLayout,
		props: ({ locals }) => ({ workspace: route, sidebarOpen: locals.workspace.sidebarOpen }),
	};
}
