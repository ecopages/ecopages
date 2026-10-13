import { fileSystem } from '@ecopages/file-system';
import { rapidhash } from '../../utils/hash.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

/**
 * Hashes the config module and the project files it imports (`absolutePaths.configModuleFiles`).
 *
 * @remarks
 * Falls back to the config module alone for hand-built configs that omit `configModuleFiles`.
 *
 * @returns `missing` when the config file does not exist.
 */
export function hashAppConfigFile(appConfig: EcoPagesAppConfig): string {
	const configPath = appConfig.absolutePaths?.config;
	if (!configPath || !fileSystem.exists(configPath)) {
		return 'missing';
	}

	const configModuleFiles = appConfig.absolutePaths.configModuleFiles ?? [configPath];
	return rapidhash(
		[...configModuleFiles]
			.sort()
			.map((filePath) => `${filePath}:${fileSystem.exists(filePath) ? fileSystem.hash(filePath) : 'missing'}`)
			.join('\n'),
	).toString(36);
}
