import { defineGet } from '@ecopages/core';

/**
 * An Endpoint makes `ecopages build` emit the server bundle that `ecopages start` runs. A Page with
 * `cache: 'dynamic'` alone builds a static-only `dist/`, which `start` refuses.
 */
export const GET = defineGet({
	handler: async ({ response }) => response.json({ status: 'ok' }),
});
