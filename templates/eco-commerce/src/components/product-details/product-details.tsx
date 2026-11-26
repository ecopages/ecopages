import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiDisclosure } from '@ecopages/radiant-ui/disclosure';
import { RuiTooltip } from '@ecopages/radiant-ui/tooltip';
import type { Product } from '@/lib/commerce/types';
import './product-details.css';

/**
 * A product's description, specifications and delivery terms, each in a `RuiDisclosure`.
 *
 * @remarks
 * The panels render open on the server and collapse only once the script runs, so without JavaScript every
 * section is readable.
 */
export const ProductDetails = eco.component<{ product: Product }, JsxRenderable>({
	dependencies: {
		scripts: ['./product-details.script.ts'],
	},
	render: ({ product }) => (
		<div class="product-details">
			<RuiDisclosure trigger="Description" open>
				<p>{product.description}</p>
			</RuiDisclosure>
			<RuiDisclosure trigger="Specifications">
				<dl class="product-details__specs">
					<dt>Material</dt>
					<dd>{product.material}</dd>
					<dt>Finishes</dt>
					<dd>{product.variants.map((variant) => variant.title).join(', ')}</dd>
					<dt>Collection</dt>
					<dd>
						{product.collection.name} / {product.category.name} / {product.subcategory.name}
					</dd>
				</dl>
			</RuiDisclosure>
			<RuiDisclosure trigger="Delivery and returns">
				<p>
					Ships in two working days.{' '}
					<RuiTooltip content="Return any item unused within 30 days for a full refund.">
						<button type="button" class="product-details__info">
							Free returns
						</button>
					</RuiTooltip>
				</p>
			</RuiDisclosure>
		</div>
	),
});
