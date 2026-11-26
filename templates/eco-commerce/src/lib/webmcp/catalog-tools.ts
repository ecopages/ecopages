import type { BrowseJson, CartJson, ProductDetailsJson, ProductListJson } from '../storefront/json.ts';
import { browseStoreTool, getCartTool, getProductTool, searchCatalogTool, type ToolDefinition } from './definitions.ts';
import { validateToolInput } from './tool-schema.ts';

/**
 * What a tool returns when it could not act; the agent reads `error`, which names the field at fault.
 *
 * @remarks
 * A tool returns this instead of throwing: WebMCP hands the agent only the name of a rejection
 * (`OperationError`), so a thrown message, such as which field failed, would not reach it.
 */
export type ToolError = { error: string };

export type ToolDeps = {
	fetch: typeof fetch;
	signal?: AbortSignal;
};

export function isToolError(value: unknown): value is ToolError {
	return typeof value === 'object' && value !== null && typeof (value as ToolError).error === 'string';
}

/** Validates the input against the tool's schema, returning the values or the error naming the field. */
export function readToolInput(tool: ToolDefinition, input: unknown): Record<string, unknown> | ToolError {
	const result = validateToolInput(tool.inputSchema, input);
	return result.ok ? result.value : { error: result.error };
}

async function readJson<T>(response: Response): Promise<T | ToolError> {
	const body = (await response.json().catch(() => null)) as (T & Partial<ToolError>) | null;
	if (!response.ok)
		return { error: typeof body?.error === 'string' ? body.error : `The store answered ${response.status}.` };
	return body ?? { error: 'The store sent an unreadable answer.' };
}

/**
 * @remarks
 * `deps.fetch` is called detached from `deps`: the browser's `fetch` throws "Illegal invocation" when its
 * receiver is any object other than the window.
 */
export function getJson<T>(url: string, { fetch: send, signal }: ToolDeps): Promise<T | ToolError> {
	return send(url, { headers: { accept: 'application/json' }, signal })
		.then((response) => readJson<T>(response))
		.catch(() => ({ error: 'The store could not be reached.' }));
}

/** Posts a cart change through the same Endpoint and form fields the page's forms use. */
export async function postCartChange(
	action: '/cart/add' | '/cart/update',
	fields: { variantId: string; quantity: number },
	{ fetch: send, signal }: ToolDeps,
): Promise<CartJson | ToolError> {
	const body = new FormData();
	body.set('variantId', fields.variantId);
	body.set('quantity', String(fields.quantity));
	const response = await send(action, {
		method: 'POST',
		body,
		headers: { accept: 'application/json' },
		signal,
	}).catch(() => null);
	return response ? readJson<CartJson>(response) : { error: 'The store could not be reached.' };
}

export async function searchCatalog(input: unknown, deps: ToolDeps): Promise<ProductListJson | ToolError> {
	const values = readToolInput(searchCatalogTool, input);
	if (isToolError(values)) return values;
	const params = new URLSearchParams({ q: String(values.query), pageSize: String(values.limit ?? 6) });
	return getJson<ProductListJson>(`/api/products?${params}`, deps);
}

/** Lists a catalog level; `place` is where the visitor is, used when the input names none. */
export async function browseStore(
	input: unknown,
	place: { collection?: string; category?: string },
	deps: ToolDeps,
): Promise<BrowseJson | ToolError> {
	const values = readToolInput(browseStoreTool, input);
	if (isToolError(values)) return values;
	const named = values.collection !== undefined || values.category !== undefined;
	const target = named ? { collection: values.collection, category: values.category } : place;
	const params = new URLSearchParams();
	if (typeof target.collection === 'string') params.set('collection', target.collection);
	if (typeof target.category === 'string') params.set('category', target.category);
	return getJson<BrowseJson>(`/api/browse?${params}`, deps);
}

export async function getProduct(
	input: unknown,
	deps: ToolDeps & { navigate: (url: string) => Promise<void> },
): Promise<ProductDetailsJson | ToolError> {
	const values = readToolInput(getProductTool, input);
	if (isToolError(values)) return values;
	const details = await getJson<ProductDetailsJson>(
		`/api/products/${encodeURIComponent(String(values.product))}`,
		deps,
	);
	if (!isToolError(details) && values.open === true) await deps.navigate(details.url);
	return details;
}

export async function getCart(input: unknown, deps: ToolDeps): Promise<CartJson | ToolError> {
	const values = readToolInput(getCartTool, input);
	if (isToolError(values)) return values;
	return getJson<CartJson>('/api/cart', deps);
}
