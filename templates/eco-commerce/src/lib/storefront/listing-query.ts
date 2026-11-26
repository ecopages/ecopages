import type { ProductQuery, ProductSort } from '../commerce/types.ts';

/** A URL Query value as the request carries it: missing, once, or repeated. */
export type QueryValue = string | string[] | undefined;

/**
 * The filters of the search page, as its URL Query holds them.
 *
 * @remarks
 * The filter forms are plain `GET /search` forms, so filters are shareable, cacheable by URL and work without
 * JavaScript. Prices are whole currency units here and cents in the backend query.
 */
export type ListingFilters = {
	q: string;
	/** A subcategory handle that scopes the listing. */
	in?: string;
	material: string[];
	finish: string[];
	min?: number;
	max?: number;
	sort: ProductSort;
	page: number;
};

export const SORTS: Array<{ value: ProductSort; label: string }> = [
	{ value: 'featured', label: 'Featured' },
	{ value: 'price-asc', label: 'Price, low to high' },
	{ value: 'price-desc', label: 'Price, high to low' },
	{ value: 'name', label: 'Name' },
];

/** Longest search term read, so a pasted essay does not become a database scan pattern. */
const MAX_TERM_LENGTH = 80;

export function firstQueryValue(value: QueryValue): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function list(value: QueryValue): string[] {
	const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
	return values.map((item) => item.trim()).filter(Boolean);
}

function positiveNumber(value: QueryValue): number | undefined {
	const raw = firstQueryValue(value);
	const number = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
	return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function isSort(value: string | undefined): value is ProductSort {
	return SORTS.some((sort) => sort.value === value);
}

export function parseListingQuery(query: Record<string, QueryValue>): ListingFilters {
	const sort = firstQueryValue(query.sort);
	const page = Number(firstQueryValue(query.page));
	const scope = firstQueryValue(query.in)?.trim();
	const filters: ListingFilters = {
		q: (firstQueryValue(query.q) ?? '').trim().slice(0, MAX_TERM_LENGTH),
		material: list(query.material),
		finish: list(query.finish),
		sort: isSort(sort) ? sort : 'featured',
		page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
	};
	if (scope) filters.in = scope;
	const min = positiveNumber(query.min);
	const max = positiveNumber(query.max);
	if (min !== undefined) filters.min = min;
	if (max !== undefined) filters.max = max;
	return filters;
}

export function toProductQuery(filters: ListingFilters): ProductQuery {
	return {
		search: filters.q || undefined,
		subcategory: filters.in,
		materials: filters.material,
		finishes: filters.finish,
		minPrice: filters.min === undefined ? undefined : Math.round(filters.min * 100),
		maxPrice: filters.max === undefined ? undefined : Math.round(filters.max * 100),
		sort: filters.sort,
		page: filters.page,
	};
}

/** The search page URL for filters, leaving defaults out so equal filters give equal URLs. */
export function listingUrl(filters: ListingFilters): string {
	const params = new URLSearchParams();
	if (filters.q) params.set('q', filters.q);
	if (filters.in) params.set('in', filters.in);
	for (const material of filters.material) params.append('material', material);
	for (const finish of filters.finish) params.append('finish', finish);
	if (filters.min !== undefined) params.set('min', String(filters.min));
	if (filters.max !== undefined) params.set('max', String(filters.max));
	if (filters.sort !== 'featured') params.set('sort', filters.sort);
	if (filters.page > 1) params.set('page', String(filters.page));
	const search = params.toString();
	return search ? `/search?${search}` : '/search';
}
