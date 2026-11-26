import '@ecopages/radiant-ui/checkbox-group';
import '@ecopages/radiant-ui/disclosure';
import '@ecopages/radiant-ui/radio-group';
import { RadiantElement, customElement, debounce, onEvent, ref } from '@ecopages/radiant';
import { agentTool } from '@ecopages/radiant/decorators/agent-tool';
import type { AgentToolExecuteOptions } from '@ecopages/radiant/helpers/register-agent-tool';
import { navigate } from '@/lib/browser/navigation';
import type { ProductListJson } from '@/lib/storefront/json';
import {
	listingApiUrl,
	listingUrl,
	parseListingQuery,
	type ListingFilters,
	type QueryValue,
} from '@/lib/storefront/listing-query';
import { getJson, isStoreError } from '@/lib/browser/store-api';
import { readToolInput } from '@/lib/webmcp/catalog-tools';
import { filterProductsTool } from '@/lib/webmcp/definitions';

function readForm(form: HTMLFormElement): ListingFilters {
	const data = new FormData(form);
	const query: Record<string, QueryValue> = {};
	for (const key of new Set(data.keys())) {
		query[key] = data.getAll(key).filter((value): value is string => typeof value === 'string');
	}
	return parseListingQuery(query);
}

/**
 * `<product-filters>`: applies each filter change as a client navigation to the search page.
 *
 * @remarks
 * The form inside is a plain `GET /search`, so filters work without JavaScript and every filtered listing has a
 * shareable URL. The `filter_products` agent tool changes the same filters and returns the first page.
 */
@customElement('product-filters')
export class ProductFiltersElement extends RadiantElement {
	@ref() form!: HTMLFormElement | null;

	@onEvent({ ref: 'form', type: 'change' })
	@debounce(250)
	onChange(): void {
		if (this.form) void navigate(listingUrl({ ...readForm(this.form), page: 1 }));
	}

	@onEvent({ ref: 'form', type: 'submit' })
	onSubmit(event: SubmitEvent): void {
		if (!this.form) return;
		event.preventDefault();
		void navigate(listingUrl({ ...readForm(this.form), page: 1 }));
	}

	@agentTool(filterProductsTool)
	async filterProducts(input: unknown, { signal }: AgentToolExecuteOptions) {
		const values = readToolInput(filterProductsTool, input);
		if (isStoreError(values)) return values;
		if (!this.form) return { error: 'The filters are not on this page.' };
		const current = readForm(this.form);
		const next: ListingFilters = {
			...current,
			material: values.materials ?? current.material,
			finish: values.finishes ?? current.finish,
			min: values.minPrice ?? current.min,
			max: values.maxPrice ?? current.max,
			sort: values.sort ?? current.sort,
			page: 1,
		};
		await navigate(listingUrl(next));
		return getJson<ProductListJson>(listingApiUrl(next), { fetch, signal });
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'product-filters': ProductFiltersElement;
	}
}
