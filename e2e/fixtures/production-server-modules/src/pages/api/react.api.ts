import { defineGet } from '@ecopages/core';

export const GET = defineGet({
	handler: async ({ response }) => response.json({ integration: 'react' }),
});
