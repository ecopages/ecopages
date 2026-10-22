import { defineGet } from '@ecopages/core';

export const GET = defineGet({
	handler: async ({ params, response }) => response.json({ id: params.id }),
});
