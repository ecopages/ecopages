import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiHeadline } from '@ecopages/radiant-ui/headline';
import {
	RuiSidebar,
	RuiSidebarContent,
	RuiSidebarInset,
	RuiSidebarMenu,
	RuiSidebarMenuButton,
	RuiSidebarMenuItem,
	RuiSidebarProvider,
} from '@ecopages/radiant-ui/sidebar';
import { ShellIcon } from './shell-icon';

const destinations = [
	{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
	{ href: '/account', label: 'Account', icon: 'account' },
] as const;

export type WorkspaceRoute = {
	current: (typeof destinations)[number]['href'];
	title: string;
};

type WorkspacePanelProps = WorkspaceRoute & {
	sidebarOpen: boolean;
	children: JsxRenderable;
};

export const WorkspacePanel = eco.component<WorkspacePanelProps, JsxRenderable>({
	dependencies: {
		scripts: [
			{ src: './workspace-elements.ts', ssr: true },
			{ src: './workspace-preference.ts', attributes: { 'data-eco-script-id': 'workspace-sidebar-preference' } },
		],
	},
	render: ({ current, title, sidebarOpen, children }) => (
		<RuiSidebarProvider
			class="workspace-layout"
			sidebar={
				<RuiSidebar
					id="workspace-sidebar"
					label="Workspace navigation"
					collapsible="icon"
					defaultOpen={sidebarOpen}
					defaultWidth={168}
					minWidth={168}
					mobileBreakpoint={520}
				>
					<RuiSidebarContent>
						<nav aria-label="Workspace">
							<RuiSidebarMenu>
								{destinations.map(({ href, label, icon }) => (
									<RuiSidebarMenuItem>
										<RuiSidebarMenuButton
											as="a"
											href={href}
											isActive={current === href}
											tooltip={label}
										>
											<ShellIcon name={icon} />
											<span>{label}</span>
										</RuiSidebarMenuButton>
									</RuiSidebarMenuItem>
								))}
							</RuiSidebarMenu>
						</nav>
					</RuiSidebarContent>
				</RuiSidebar>
			}
		>
			<RuiSidebarInset class="panel" id="main-content">
				<RuiHeadline as="h1" size={false} class="panel-title">
					{title}
				</RuiHeadline>
				{children}
			</RuiSidebarInset>
		</RuiSidebarProvider>
	),
});
