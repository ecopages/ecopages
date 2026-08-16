import { config } from 'dotenv';
import { z } from 'zod';
import { join } from 'node:path';

/**
 * Loads `.env` file from the app directory and validates all environment
 * variables at startup. Fails fast on invalid configuration.
 */
function loadAndValidateEnv() {
	config({ path: join(import.meta.dirname, '../../.env') });

	const envSchema = z.object({
		ECOPAGES_BASE_URL: z.string().url().default('http://localhost:3333'),

		WIKI_DIR: z.string().default(join(import.meta.dirname, '../../../wiki')),

		SOURCES_DIR: z.string().default(join(import.meta.dirname, '../../../sources')),

		WIKI_CATEGORY_MODE: z.enum(['auto', 'frontmatter', 'directory']).default('auto'),

		WIKI_HOME_SLUG: z.string().optional(),

		OBSIDIAN_VAULT_PATH: z.string().optional(),
		LLM_WIKI_OBSIDIAN_SUBDIR: z.string().default('llm-wiki'),
	});

	const parsed = envSchema.safeParse(process.env);

	if (!parsed.success) {
		console.error('[env] Invalid environment variables:');
		for (const issue of parsed.error.issues) {
			console.error(`  ${issue.path.join('.')}: ${issue.message}`);
		}
		process.exit(1);
	}

	return parsed.data;
}

export const env = loadAndValidateEnv();
