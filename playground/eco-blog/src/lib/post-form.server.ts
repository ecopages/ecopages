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
	intent: z.enum(['publish', 'draft']).default('publish'),
});

/**
 * Reads the admin post form, answering 400 when a field is missing or the slug is not kebab-case.
 *
 * @remarks
 * `intent` comes from the submit button: `publish` or `draft`.
 */
export async function readPostForm(request: Request) {
	const result = postForm.safeParse(Object.fromEntries(await request.formData()));
	if (!result.success) throw HttpError.BadRequest('Invalid post', { issues: result.error.issues });
	return result.data;
}

export const postIdParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * The publish date a write should store.
 *
 * @remarks
 * Publishing a draft stamps the current time; updating a published post keeps its date; saving as a draft clears it.
 */
export function publishDateFor(intent: 'publish' | 'draft', current: Date | null = null): Date | null {
	if (intent === 'draft') return null;
	return current ?? new Date();
}
