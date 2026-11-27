import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiTab, RuiTabList, RuiTabPanel, RuiTabPanels, RuiTabs } from '@ecopages/radiant-ui/tabs';
import type { ProductCard } from '@/lib/commerce/types';
import { ProductGrid } from '@/components/product-grid/product-grid';

export type FeaturedTabsProps = {
	newest: ProductCard[];
	onSale: ProductCard[];
};

/**
 * New arrivals and products on sale, in `RuiTabs`.
 *
 * @remarks
 * Both panels render on the server, so without JavaScript they show one after the other.
 */
export const FeaturedTabs = eco.component<FeaturedTabsProps, JsxRenderable>({
	dependencies: {
		scripts: ['./featured-tabs.script.ts'],
	},
	render: ({ newest, onSale }) => (
		<RuiTabs class="featured-tabs">
			<RuiTabList aria-label="Featured products">
				<RuiTab id="new" selected>
					New arrivals
				</RuiTab>
				<RuiTab id="sale">On sale</RuiTab>
			</RuiTabList>
			<RuiTabPanels>
				<RuiTabPanel id="new" selected>
					<ProductGrid products={newest} eagerCount={6} label="New arrivals" />
				</RuiTabPanel>
				<RuiTabPanel id="sale">
					<ProductGrid products={onSale} label="On sale" />
				</RuiTabPanel>
			</RuiTabPanels>
		</RuiTabs>
	),
});
