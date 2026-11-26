import type { JsxRenderable } from '@ecopages/jsx';
import { RuiInput } from '@ecopages/radiant-ui/input';
import { cx } from '@/lib/cx';
import { storePaths } from '@/lib/store-urls';

/**
 * A plain `GET /search` form, so search works without JavaScript and results have shareable URLs.
 */
export function SearchForm({
	query = '',
	id = 'search-query',
	class: className,
}: {
	query?: string;
	/** The input id; give each form on a page its own. */
	id?: string;
	class?: string;
}): JsxRenderable {
	return (
		<form role="search" action={storePaths.search} method="get" class={cx('search-form', className)}>
			<label class="sr-only" for={id}>
				Search products
			</label>
			<RuiInput id={id} type="search" name="q" value={query} placeholder="Search products" />
		</form>
	);
}
