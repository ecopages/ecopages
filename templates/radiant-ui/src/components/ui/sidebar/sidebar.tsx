/**
 * Sidebar — `@ecopages/radiant-ui/sidebar`.
 *
 * `Sidebar` owns this component's stylesheet and lazy script, so listing it in
 * a page or layout `dependencies.components` ships everything it needs.
 *
 * A sidebar on its own does nothing. The working arrangement is four parts: a
 * `SidebarProvider` that owns the shell grid, the `Sidebar` pane inside it, a
 * `SidebarInset` for the page content beside it, and a `SidebarTrigger` that
 * names the sidebar it toggles by `id`. Miss the provider and the pane sits on
 * top of the content; miss the trigger's `controls` and it toggles nothing.
 *
 * `SidebarLayout` puts all four together — pass `sidebar` and `children`.
 *
 * Within the pane, the navigation itself is six primitives per group, so
 * `Sidebar` takes `groups` and `currentPath` and stamps them, marking the
 * active link so it is both styled and announced as the current page. Pass
 * `icon` on a link for the collapsed-icon pattern from the app-shell example.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiSidebar,
	RuiSidebarContent,
	RuiSidebarFooter,
	RuiSidebarGroup,
	RuiSidebarGroupHeader,
	RuiSidebarHeader,
	RuiSidebarInset,
	RuiSidebarMenu,
	RuiSidebarMenuButton,
	RuiSidebarMenuItem,
	RuiSidebarProvider,
	RuiSidebarSeparator,
	RuiSidebarTrigger,
	type RuiSidebarProviderProps,
	type RuiSidebarTriggerViewProps,
	type RuiSidebarViewProps,
} from '@ecopages/radiant-ui/sidebar';
import { Button } from '../button';

export type SidebarLink = {
	label: JsxRenderable;
	href: string;
	/** Leading icon; pair with a string `label` so collapsed mode can use `tooltip`. */
	icon?: JsxRenderable;
};

export type SidebarGroup = {
	/** Group heading, also the group's accessible name. */
	name: string;
	links: SidebarLink[];
};

export type SidebarProps = Omit<RuiSidebarViewProps, 'children'> & {
	/** Navigation groups, rendered in order with separators between them. */
	groups?: SidebarGroup[];
	/** The route currently being viewed; its link is marked active. */
	currentPath?: string;
	/** Content above the navigation — a brand mark, a search box. */
	header?: JsxRenderable;
	/** Content pinned below the navigation. */
	footer?: JsxRenderable;
	children?: JsxRenderable;
};

export type SidebarTriggerProps = RuiSidebarTriggerViewProps;

export type SidebarLayoutProps = Omit<RuiSidebarProviderProps, 'sidebar'> & {
	/** The `Sidebar` pane. */
	sidebar: JsxRenderable;
	/** Page content, placed in the inset beside the pane. */
	children?: JsxRenderable;
	/** Skips the inset wrapper when the page supplies its own. */
	bare?: boolean;
};

export const Sidebar = eco.component<SidebarProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./sidebar.css'],
		scripts: [{ src: './sidebar.script.ts', lazy: { 'on:idle': true } }],
		components: [Button],
	},
	render: ({ groups, currentPath, header, footer, children, ...props }) => (
		<RuiSidebar {...props}>
			{header ? <RuiSidebarHeader>{header}</RuiSidebarHeader> : null}
			<RuiSidebarContent>
				{groups
					? groups.map((group, index) => (
							<>
								<RuiSidebarGroup aria-label={group.name}>
									<RuiSidebarGroupHeader label={group.name} />
									<RuiSidebarMenu aria-label={`${group.name} links`}>
										{group.links.map((link) => (
											<RuiSidebarMenuItem>
												<RuiSidebarMenuButton
													as="a"
													href={link.href}
													isActive={currentPath === link.href}
													tooltip={typeof link.label === 'string' ? link.label : undefined}
												>
													{link.icon}
													{typeof link.label === 'string' ? <span>{link.label}</span> : link.label}
												</RuiSidebarMenuButton>
											</RuiSidebarMenuItem>
										))}
									</RuiSidebarMenu>
								</RuiSidebarGroup>
								{index < groups.length - 1 ? <RuiSidebarSeparator /> : null}
							</>
						))
					: children}
			</RuiSidebarContent>
			{footer ? <RuiSidebarFooter>{footer}</RuiSidebarFooter> : null}
		</RuiSidebar>
	),
});

/** Toggles the sidebar whose `id` it names in `controls`. */
export const SidebarTrigger = eco.component<SidebarTriggerProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./sidebar.css'],
		scripts: [{ src: './sidebar.script.ts', lazy: { 'on:idle': true } }],
	},
	render: RuiSidebarTrigger,
});

/** The shell: the pane, the content beside it, and the grid that places both. */
export const SidebarLayout = eco.component<SidebarLayoutProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./sidebar.css'],
		scripts: [{ src: './sidebar.script.ts', lazy: { 'on:idle': true } }],
		components: [Sidebar],
	},
	render: ({ sidebar, children, bare, ...props }) => (
		<RuiSidebarProvider {...props} sidebar={sidebar}>
			{bare ? children : <RuiSidebarInset>{children}</RuiSidebarInset>}
		</RuiSidebarProvider>
	),
});
