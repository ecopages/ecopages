import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Pager } from '@/components/pager/pager';
import { ProductFilters } from '@/components/product-filters/product-filters';
import { ProductGrid } from '@/components/product-grid/product-grid';
import type { SubcategoryPageProps } from '@/lib/storefront/subcategory-page.server';
import { categoryUrl, collectionUrl, subcategoryUrl } from '@/lib/storefront/urls';
import './subcategory-listing.css';

/**
 * A subcategory listing page: filters beside a product grid, with links to the other pages.
 *
 * @remarks
 * The listing itself is static. Filtering sends the visitor to the search page scoped to this subcategory
 * (`/search?in=…`), which renders per request.
 */
export function SubcategoryListing({ detail, results, filters }: SubcategoryPageProps): JsxRenderable {
	const { collection, category, subcategory } = detail;
	return (
		<>
			<Breadcrumbs
				crumbs={[
					{ label: 'Home', href: '/' },
					{ label: collection.name, href: collectionUrl(collection) },
					{ label: category.name, href: categoryUrl(collection, category) },
					{ label: subcategory.name },
				]}
			/>
			<header class="page-header">
				<h1>{subcategory.name}</h1>
				<p>
					{results.total} products
					{results.pageCount > 1 ? `, page ${results.page} of ${results.pageCount}` : ''}
				</p>
			</header>
			<div class="listing-layout">
				<aside class="listing-layout__filters">
					<ProductFilters filters={filters} facets={results.facets} />
				</aside>
				<div>
					<ProductGrid products={results.items} eagerCount={8} label={subcategory.name} />
					<Pager
						page={results.page}
						pageCount={results.pageCount}
						href={(page) => subcategoryUrl(collection, category, subcategory, page)}
					/>
				</div>
			</div>
		</>
	);
}
