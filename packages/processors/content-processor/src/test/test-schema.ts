import { z } from 'zod';

export const testContentSchema = z.object({
	title: z.string(),
	description: z.string(),
	order: z.coerce.number().optional(),
});
