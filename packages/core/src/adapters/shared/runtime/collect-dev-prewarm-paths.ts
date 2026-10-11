import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';

/**
 * Merges app `devPrewarmPaths` with processor-declared pathnames, without duplicates.
 */
export async function collectAppDevPrewarmPaths(appConfig: EcoPagesAppConfig): Promise<string[]> {
	const pathnames = new Set(appConfig.devPrewarmPaths ?? []);

	for (const processor of appConfig.processors.values()) {
		for (const pathname of await processor.collectDevPrewarmPaths()) {
			pathnames.add(pathname);
		}
	}

	return [...pathnames];
}
