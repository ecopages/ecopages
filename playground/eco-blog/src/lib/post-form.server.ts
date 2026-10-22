import { HttpError } from '@ecopages/core/errors';
import { z } from 'zod';

const postForm = z.object({
	title: z.string().trim().min(1),
	slug: z
		.string()
		.trim()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	content: z.string(),
	excerpt: z
		.string()
		.trim()
		.optional()
		.transform((excerpt) => excerpt || null),
});

/** Reads the admin post form, answering 400 when a field is missing or the slug is not kebab-case. */
export async function readPostForm(request: Request) {
	const result = postForm.safeParse(Object.fromEntries(await request.formData()));
	if (!result.success) throw HttpError.BadRequest('Invalid post', { issues: result.error.issues });
	return result.data;
}

export const postIdParams = z.object({ id: z.coerce.number().int().positive() });
