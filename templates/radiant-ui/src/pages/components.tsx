import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import { Section } from '@/components/blocks/section';
import { Heading } from '@/components/ui/heading';
import {
	DataDemos,
	DatesDemos,
	DisplayDemos,
	InputsDemos,
	NavigationDemos,
	OverlaysDemos,
	SelectionDemos,
} from '@/components/catalog';

/**
 * Every composed component, rendered once, grouped by family.
 *
 * The demos live in `src/components/catalog/` — one module per family — so the
 * catalog can grow without any single file owning all of it. This page is the
 * running order.
 *
 * It doubles as a check that each module renders: a component that breaks after
 * a Radiant UI upgrade shows up here rather than in someone's app.
 */
export default eco.page<{}, JsxRenderable>({
	dependencies: {
		stylesheets: ['./components.css'],
		components: [
			Section,
			Heading,
			InputsDemos,
			SelectionDemos,
			DatesDemos,
			OverlaysDemos,
			NavigationDemos,
			DataDemos,
			DisplayDemos,
		],
	},
	layout: { component: BaseLayout, props: () => ({ currentPath: '/components' }) },
	metadata: () => ({
		title: 'Components',
		description: 'Every Radiant UI component, composed and ready to paste into a page.',
	}),
	render: () => (
		<>
			<Section spacing="lg">
				<Heading
					size="lg"
					eyebrow="Catalog"
					title="Components"
					titleAs="h1"
					description="Each entry is the composed component from src/components/ui, rendered with the props you would actually reach for. Open the module to change how any of them assemble."
				/>
			</Section>

			<Section spacing="lg" class="catalog">
				<InputsDemos />
				<SelectionDemos />
				<DatesDemos />
				<OverlaysDemos />
				<NavigationDemos />
				<DataDemos />
				<DisplayDemos />
			</Section>
		</>
	),
});
