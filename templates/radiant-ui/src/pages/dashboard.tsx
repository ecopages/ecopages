import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import { Sidebar, SidebarLayout, SidebarTrigger } from '@/components/ui/sidebar';
import { Heading } from '@/components/ui/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/ui/meter';
import { Table } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { MenuButton } from '@/components/ui/menu-button';
import { Toaster } from '@/components/ui/toast';
import { RuiButton } from '@ecopages/radiant-ui/button';

const NAV = [
	{
		name: 'Overview',
		links: [
			{ label: 'Dashboard', href: '/dashboard' },
			{ label: 'Activity', href: '/dashboard#activity' },
		],
	},
	{
		name: 'Build',
		links: [
			{ label: 'Components', href: '/components' },
			{ label: 'Forms', href: '/forms' },
		],
	},
	{
		name: 'Reference',
		links: [{ label: 'Docs', href: '/about' }],
	},
];

const DEPLOYS = [
	{ id: 'd1', cells: { commit: 'refactor: split templates', branch: 'main', status: 'Ready', time: '2m ago' } },
	{ id: 'd2', cells: { commit: 'feat: compose form controls', branch: 'main', status: 'Ready', time: '1h ago' } },
	{ id: 'd3', cells: { commit: 'chore: bump radiant-ui', branch: 'deps', status: 'Building', time: '3h ago' } },
	{ id: 'd4', cells: { commit: 'fix: dialog trigger wiring', branch: 'main', status: 'Failed', time: '1d ago' } },
];

/**
 * An application shell: sidebar, inset, and a page of data components.
 *
 * The layout half is `SidebarLayout` — the provider grid, the pane and the
 * inset — with a `SidebarTrigger` naming the pane it toggles. The `Toaster` is
 * mounted once here so `toast()` works from anywhere on the page.
 */
export default eco.page<{}, JsxRenderable>({
	dependencies: {
		stylesheets: ['./dashboard.css'],
		components: [
			SidebarLayout,
			Sidebar,
			SidebarTrigger,
			Heading,
			Badge,
			Button,
			Meter,
			Table,
			Tabs,
			MenuButton,
			Toaster,
		],
	},
	layout: { component: BaseLayout, props: () => ({ currentPath: '/dashboard' }) },
	metadata: () => ({
		title: 'Dashboard',
		description: 'An application shell built from the sidebar, table and tabs components.',
	}),
	render: () => (
		<SidebarLayout
			class="dashboard"
			sidebar={
				<Sidebar
					id="dashboard-sidebar"
					collapsible="icon"
					groups={NAV}
					currentPath="/dashboard"
					header={<span class="dashboard__brand">Acme</span>}
					footer={<span class="dashboard__plan">Pro plan</span>}
				/>
			}
		>
			<header class="dashboard__bar">
				<SidebarTrigger controls="dashboard-sidebar" placement="inset" triggerLabel="Toggle sidebar" />
				<Heading class="dashboard__title" title="Dashboard" titleAs="h1" size="sm" />
				<MenuButton
					trigger={
						<RuiButton variant="outline" size="sm">
							New
						</RuiButton>
					}
					items={[
						{ value: 'project', label: 'Project' },
						{ value: 'deploy', label: 'Deployment' },
						{ type: 'separator' },
						{ value: 'invite', label: 'Invite teammate' },
					]}
				/>
			</header>

			<section class="dashboard__meters" aria-label="Usage">
				<div class="dashboard__meter">
					<Meter label="Build minutes" value={72} min={0} max={100} />
					<p class="dashboard__hint">720 of 1,000 used this month</p>
				</div>
				<div class="dashboard__meter">
					<Meter label="Bandwidth" value={38} min={0} max={100} />
					<p class="dashboard__hint">38 GB of 100 GB</p>
				</div>
				<div class="dashboard__meter">
					<Meter label="Storage" value={91} min={0} max={100} />
					<p class="dashboard__hint">Approaching the limit</p>
				</div>
			</section>

			<section class="dashboard__panel" id="activity" aria-label="Activity">
				<Tabs
					label="Activity"
					variant="boxed"
					items={[
						{
							id: 'deploys',
							label: 'Deployments',
							content: (
								<Table
									label="Recent deployments"
									selectionMode="multiple"
									columns={[
										{ id: 'commit', label: 'Commit', isRowHeader: true },
										{ id: 'branch', label: 'Branch' },
										{ id: 'status', label: 'Status', allowsSorting: true },
										{ id: 'time', label: 'When', allowsSorting: true },
									]}
									rows={DEPLOYS.map((row) => ({
										...row,
										cells: {
											...row.cells,
											status: (
												<Badge
													variant={row.cells.status === 'Failed' ? 'destructive' : 'muted'}
												>
													{row.cells.status}
												</Badge>
											),
										},
									}))}
								/>
							),
						},
						{
							id: 'members',
							label: 'Members',
							content: (
								<Table
									label="Team members"
									columns={[
										{ id: 'name', label: 'Name', isRowHeader: true },
										{ id: 'role', label: 'Role' },
									]}
									rows={[
										{ id: 'ada', cells: { name: 'Ada Lovelace', role: 'Owner' } },
										{ id: 'jane', cells: { name: 'Jane Cooper', role: 'Developer' } },
									]}
								/>
							),
						},
						{
							id: 'settings',
							label: 'Settings',
							content: (
								<div class="dashboard__settings">
									<p>Project settings would live here.</p>
									<Button href="/forms" variant="outline">
										Open the form patterns
									</Button>
								</div>
							),
						},
					]}
				/>
			</section>

			<Toaster position="bottom-end" />
		</SidebarLayout>
	),
});
