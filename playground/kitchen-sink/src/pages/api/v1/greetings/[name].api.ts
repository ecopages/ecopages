import { defineGet } from '@ecopages/core';
import { z } from 'zod';

const params = z.object({ name: z.string().trim().min(1) });

export const GET = defineGet({
	schema: { params },
	handler: async ({ params, response }) => response.json({ greeting: 'Hello', name: params.name }),
});
