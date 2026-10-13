/**
 * Navigation — Moving around, and hiding what is not needed yet.
 *
 * One entry per component, rendered with the props you would actually
 * reach for. Split by family so no single file owns the whole catalog.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ComponentDemo } from '@/components/blocks/component-demo';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Disclosure } from '@/components/ui/disclosure';
import { NavigationMenu } from '@/components/ui/navigation-menu';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';

export const NavigationDemos = eco.component<{}, JsxRenderable>({
	dependencies: { components: [ComponentDemo, Breadcrumb, Disclosure, NavigationMenu, Pagination, Tabs] },
	render: () => (
		<>
			<ComponentDemo
				id="breadcrumb"
				name="Breadcrumb"
				summary="Builds the trail from data — links, separators, and the last crumb as the current page."
			>
				<Breadcrumb
					items={[
						{ label: 'Home', href: '/' },
						{ label: 'Components', href: '/components' },
						{ label: 'Breadcrumb' },
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="navigation-menu"
				name="NavigationMenu"
				summary="Entries with href become links; entries with panel become triggers plus their panel."
			>
				<NavigationMenu
					label="Product"
					items={[
						{ label: 'Overview', href: '/' },
						{
							value: 'resources',
							label: 'Resources',
							panel: (
								<div class="navpanel">
									<a href="/components">Components</a>
									<a href="/about">Docs</a>
								</div>
							),
						},
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="pagination"
				name="Pagination"
				summary="Numbered nav, previous and next, and the ellipses — all from page and pageCount."
			>
				<Pagination page={4} pageCount={12} />
			</ComponentDemo>

			<ComponentDemo
				id="tabs"
				name="Tabs"
				summary="Each entry contributes both its control and its panel; the first is selected."
			>
				<Tabs
					class="w-full"
					label="Package sections"
					items={[
						{ id: 'install', label: 'Install', content: <p>pnpm add @ecopages/radiant-ui</p> },
						{
							id: 'usage',
							label: 'Usage',
							content: <p>Import the composed component from src/components/ui.</p>,
						},
						{
							id: 'theme',
							label: 'Theme',
							content: <p>Swap the theme import in src/styles/tailwind.css.</p>,
						},
					]}
				/>
			</ComponentDemo>

			<ComponentDemo
				id="disclosure"
				name="Disclosure"
				summary="Trigger prop stamps the summary row and the collapsible panel."
			>
				<Disclosure class="w-full" trigger="What ships in this template?" open>
					Fifty-six composed components and thirteen page blocks.
				</Disclosure>
			</ComponentDemo>
		</>
	),
});
