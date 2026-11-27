import type { CartJson } from '../storefront/json.ts';

/**
 * Why a store action could not be done, in words a visitor or an agent can read: an Endpoint's refusal, a
 * failed request, or input a tool could not accept.
 *
 * @remarks
 * Agent tools return this instead of throwing: WebMCP hands the agent only the name of a rejection
 * (`OperationError`), so a thrown message, such as which field failed, would not reach it.
 */
export type StoreError = { error: string };

export type StoreApiDeps = {
	fetch: typeof fetch;
	signal?: AbortSignal;
};

export function isStoreError(value: unknown): value is StoreError {
	return typeof value === 'object' && value !== null && typeof (value as StoreError).error === 'string';
}

async function readJson<T>(response: Response): Promise<T | StoreError> {
	const body = (await response.json().catch(() => null)) as (T & Partial<StoreError>) | null;
	if (!response.ok)
		return { error: typeof body?.error === 'string' ? body.error : `The store answered ${response.status}.` };
	return body ?? { error: 'The store sent an unreadable answer.' };
}

/**
 * Reads a JSON Endpoint.
 *
 * @remarks
 * `deps.fetch` is called detached from `deps`: the browser's `fetch` throws "Illegal invocation" when its
 * receiver is any object other than the window.
 */
export function getJson<T>(url: string, { fetch: send, signal }: StoreApiDeps): Promise<T | StoreError> {
	return send(url, { headers: { accept: 'application/json' }, signal })
		.then((response) => readJson<T>(response))
		.catch(() => ({ error: 'The store could not be reached.' }));
}

/** Posts a cart change through the same Endpoint and form fields the page's forms use. */
export async function postCartChange(
	action: '/cart/add' | '/cart/update',
	fields: { variantId: string; quantity: number },
	{ fetch: send, signal }: StoreApiDeps,
): Promise<CartJson | StoreError> {
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
