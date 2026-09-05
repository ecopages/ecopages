import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiSidebarMenu,
	RuiSidebarMenuButton,
	RuiSidebarMenuItem,
} from '@ecopages/radiant-ui/sidebar';
import { RuiMenuButtonContent, RuiMenuButtonItem, RuiMenuButtonTrigger } from '@ecopages/radiant-ui/menu-button';
import { RuiSeparator } from '@ecopages/radiant-ui/separator';
import { AppLayout } from '@/layouts/app-layout';
import { Sidebar, SidebarLayout, SidebarTrigger } from '@/components/ui/sidebar';
import { Heading } from '@/components/ui/heading';
import { Meter } from '@/components/ui/meter';
import { MenuButton } from '@/components/ui/menu-button';
import { Toaster } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { DataTable } from '@/components/dashboard/data-table';

const ICONS = {
	home: 'M3 12 12 3l9 9M5 10v10h14V10',
	activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
	layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
	file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
	book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z',
	globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
	user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
	settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};

function NavIcon({ name }: { name: keyof typeof ICONS }) {
	return (
		<svg
			class="dashboard__nav-icon"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d={ICONS[name]} />
		</svg>
	);
}

const NAV = [
	{
		name: 'Workspace',
		links: [
			{ label: 'Dashboard', href: '/dashboard', icon: <NavIcon name="home" /> },
			{ label: 'Inventory', href: '/dashboard#inventory', icon: <NavIcon name="layers" /> },
		],
	},
	{
		name: 'Build',
		links: [
			{ label: 'Components', href: '/components', icon: <NavIcon name="file" /> },
			{ label: 'Forms', href: '/forms', icon: <NavIcon name="activity" /> },
		],
	},
	{
		name: 'Reference',
		links: [
			{ label: 'Docs', href: '/about', icon: <NavIcon name="book" /> },
			{ label: 'Site', href: '/', icon: <NavIcon name="globe" /> },
		],
	},
];

/**
 * An application shell: sidebar, inset, KPIs, and a working inventory table.
 *
 * The layout half is `SidebarLayout`. Navigation follows the Radiant UI
 * app-shell example: brand mark, header trigger, icon links with tooltips,
 * and account shortcuts in the footer. `DataTable` is the data-table story
 * wired to an in-memory inventory.
 */
export default eco.page<{}, JsxRenderable>({
	dependencies: {
		stylesheets: ['./dashboard.css'],
		components: [
			SidebarLayout,
			Sidebar,
			SidebarTrigger,
			Heading,
			Meter,
			MenuButton,
			Toaster,
			Avatar,
			ThemeToggle,
			DataTable,
		],
	},
	layout: { component: AppLayout },
	metadata: () => ({
		title: 'Dashboard',
		description: 'An application shell with a working inventory data table.',
	}),
	render: () => (
		<SidebarLayout
			class="dashboard"
			sidebar={
				<Sidebar
					id="dashboard-sidebar"
					label="Primary"
					collapsible="icon"
					groups={NAV}
					currentPath="/dashboard"
					header={
						<>
							<a href="/" class="dashboard__brand">
								<span class="dashboard__brand-mark">A</span>
								<span class="dashboard__brand-name">Acme</span>
							</a>
							<SidebarTrigger
								controls="dashboard-sidebar"
								placement="header"
								triggerLabel="Toggle sidebar"
							/>
						</>
					}
					footer={
						<RuiSidebarMenu aria-label="Account">
							<RuiSidebarMenuItem>
								<RuiSidebarMenuButton as="a" href="/dashboard#inventory" tooltip="Profile">
									<NavIcon name="user" />
									<span>Profile</span>
								</RuiSidebarMenuButton>
							</RuiSidebarMenuItem>
							<RuiSidebarMenuItem>
								<RuiSidebarMenuButton as="a" href="/forms" tooltip="Settings">
									<NavIcon name="settings" />
									<span>Settings</span>
								</RuiSidebarMenuButton>
							</RuiSidebarMenuItem>
						</RuiSidebarMenu>
					}
				/>
			}
		>
			<header class="dashboard__bar">
				<div class="dashboard__bar-start">
					<SidebarTrigger controls="dashboard-sidebar" placement="inset" triggerLabel="Open sidebar" />
					<Heading class="dashboard__title" title="Overview" titleAs="h1" size="sm" />
				</div>
				<div class="dashboard__bar-tools">
					<p class="dashboard__shortcut">Cmd/Ctrl+B toggles the sidebar</p>
					<ThemeToggle />
					<MenuButton>
						<RuiMenuButtonTrigger variant="ghost" size="sm" aria-label="Account menu">
							<Avatar fallback="AL" size="sm" alt="" />
						</RuiMenuButtonTrigger>
						<RuiMenuButtonContent>
							<RuiMenuButtonItem value="account">Account</RuiMenuButtonItem>
							<RuiMenuButtonItem value="billing">Billing</RuiMenuButtonItem>
							<RuiSeparator />
							<RuiMenuButtonItem value="signout">Sign out</RuiMenuButtonItem>
						</RuiMenuButtonContent>
					</MenuButton>
				</div>
			</header>

			<div class="dashboard__body">
				<section class="dashboard__kpis" aria-label="Key metrics">
					<div class="dashboard__kpi">
						<p class="dashboard__kpi-label">Projects</p>
						<p class="dashboard__kpi-value">12</p>
						<p class="dashboard__kpi-trend dashboard__kpi-trend--up">+2 this month</p>
					</div>
					<div class="dashboard__kpi">
						<p class="dashboard__kpi-label">Deploys this week</p>
						<p class="dashboard__kpi-value">48</p>
						<p class="dashboard__kpi-trend dashboard__kpi-trend--up">+12%</p>
					</div>
					<div class="dashboard__kpi">
						<p class="dashboard__kpi-label">Build minutes</p>
						<p class="dashboard__kpi-value">720</p>
						<p class="dashboard__kpi-trend">72% of quota</p>
					</div>
					<div class="dashboard__kpi">
						<p class="dashboard__kpi-label">Error rate</p>
						<p class="dashboard__kpi-value">0.4%</p>
						<p class="dashboard__kpi-trend dashboard__kpi-trend--warn">Above baseline</p>
					</div>
				</section>

				<section class="dashboard__usage" aria-label="Usage">
					<h2 class="dashboard__panel-title">Usage this month</h2>
					<div class="dashboard__meters">
						<div class="dashboard__meter">
							<Meter label="Build minutes" value={72} min={0} max={100} />
							<p class="dashboard__hint">720 of 1,000 minutes</p>
						</div>
						<div class="dashboard__meter">
							<Meter label="Bandwidth" value={38} min={0} max={100} />
							<p class="dashboard__hint">38 GB of 100 GB</p>
						</div>
						<div class="dashboard__meter">
							<Meter label="Storage" value={91} min={0} max={100} />
							<p class="dashboard__hint">Approaching the 100 GB limit</p>
						</div>
					</div>
				</section>

				<section class="dashboard__panel" id="inventory" aria-label="Inventory">
					<div class="dashboard__panel-head">
						<h2 class="dashboard__panel-title">Cheese inventory</h2>
						<p class="dashboard__hint">Search, filter, sort, paginate, and edit — same pattern as the Radiant UI data table example.</p>
					</div>
					<DataTable />
				</section>
			</div>

			<Toaster position="bottom-end" />
		</SidebarLayout>
	),
});
