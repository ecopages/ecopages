import { getJson, isStoreError, type StoreApiDeps, type StoreError } from '../browser/store-api.ts';
import type { BrowseJson, CartJson, ProductDetailsJson, ProductListJson } from '../storefront/json.ts';
import { browseStoreTool, getCartTool, getProductTool, openProductTool, searchCatalogTool } from './definitions.ts';
import { validateToolInput, type ToolInput, type ToolInputSchema } from './tool-schema.ts';

/** Validates the input against the tool's schema, returning the values or the error naming the field. */
export function readToolInput<S extends ToolInputSchema>(
	tool: { inputSchema: S },
	input: unknown,
): ToolInput<S> | StoreError {
	const result = validateToolInput(tool.inputSchema, input);
	return result.ok ? result.value : { error: result.error };
}

export async function searchCatalog(input: unknown, deps: StoreApiDeps): Promise<ProductListJson | StoreError> {
	const values = readToolInput(searchCatalogTool, input);
	if (isStoreError(values)) return values;
	const params = new URLSearchParams({ q: values.query, pageSize: String(values.limit ?? 6) });
	return getJson<ProductListJson>(`/api/products?${params}`, deps);
}

/** Lists a catalog level; `place` is where the visitor is, used when the input names none. */
export async function browseStore(
	input: unknown,
	place: { collection?: string; category?: string },
	deps: StoreApiDeps,
): Promise<BrowseJson | StoreError> {
	const values = readToolInput(browseStoreTool, input);
	if (isStoreError(values)) return values;
	const named = values.collection !== undefined || values.category !== undefined;
	const target = named ? { collection: values.collection, category: values.category } : place;
	const params = new URLSearchParams();
	if (typeof target.collection === 'string') params.set('collection', target.collection);
	if (typeof target.category === 'string') params.set('category', target.category);
	return getJson<BrowseJson>(`/api/browse?${params}`, deps);
}

async function readProduct(
	tool: typeof getProductTool | typeof openProductTool,
	input: unknown,
	deps: StoreApiDeps,
): Promise<ProductDetailsJson | StoreError> {
	const values = readToolInput(tool, input);
	if (isStoreError(values)) return values;
	return getJson<ProductDetailsJson>(`/api/products/${encodeURIComponent(values.product)}`, deps);
}

export function getProduct(input: unknown, deps: StoreApiDeps): Promise<ProductDetailsJson | StoreError> {
	return readProduct(getProductTool, input, deps);
}

/** Shows the product page once its details resolve, so an unknown handle leaves the page where it is. */
export async function openProduct(
	input: unknown,
	deps: StoreApiDeps & { navigate: (url: string) => Promise<void> },
): Promise<ProductDetailsJson | StoreError> {
	const details = await readProduct(openProductTool, input, deps);
	if (!isStoreError(details)) await deps.navigate(details.url);
	return details;
}

export async function getCart(input: unknown, deps: StoreApiDeps): Promise<CartJson | StoreError> {
	const values = readToolInput(getCartTool, input);
	if (isStoreError(values)) return values;
	return getJson<CartJson>('/api/cart', deps);
}
