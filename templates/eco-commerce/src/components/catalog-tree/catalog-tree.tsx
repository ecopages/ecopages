import type { JsxRenderable } from '@ecopages/jsx';
import type { CollectionDetail } from '@/lib/commerce/types';
import { categoryUrl, collectionUrl, subcategoryUrl } from '@/lib/storefront/urls';
import './catalog-tree.css';

export type CatalogTreeProps = {
	collection: CollectionDetail;
	/** Renders the collection name as a heading that links to the collection. */
	showCollection?: boolean;
	/** How many tiles load their image eagerly, counted across the tree. */
	eagerCount?: number;
};

/**
 * A collection's categories, each with a tile per subcategory.
 *
 * @remarks
 * Every tile is a plain link the browser router prefetches on viewport entry, so the home page, which renders
 * every collection, holds hundreds of prefetchable links. Sections use `content-visibility: auto`, so the
 * browser skips layout and paint for the ones off screen.
 */
export function CatalogTree({ collection, showCollection = false, eagerCount = 0 }: CatalogTreeProps): JsxRenderable {
	let tileIndex = 0;
	return (
		<section class="catalog-tree" aria-labelledby={`tree-${collection.handle}`}>
			{showCollection ? (
				<h2 class="catalog-tree__collection" id={`tree-${collection.handle}`}>
					<a href={collectionUrl(collection)} data-eco-prefetch="viewport">
						{collection.name}
					</a>
				</h2>
			) : (
				<h2 class="sr-only" id={`tree-${collection.handle}`}>
					{collection.name} categories
				</h2>
			)}
			{collection.categories.map((category) => (
				<div class="catalog-tree__category">
					<h3 class="catalog-tree__category-name">
						<a href={categoryUrl(collection, category)} data-eco-prefetch="viewport">
							{category.name}
						</a>
					</h3>
					<ul class="catalog-tree__tiles">
						{category.subcategories.map((subcategory) => (
							<li>
								<a
									class="catalog-tile"
									href={subcategoryUrl(collection, category, subcategory)}
									data-eco-prefetch="viewport"
								>
									<img
										src={subcategory.thumbnail}
										alt=""
										width={96}
										height={96}
										loading={tileIndex++ < eagerCount ? 'eager' : 'lazy'}
										decoding="async"
									/>
									<span class="catalog-tile__name">{subcategory.name}</span>
									<span class="catalog-tile__count">{subcategory.productCount} items</span>
								</a>
							</li>
						))}
					</ul>
				</div>
			))}
		</section>
	);
}
