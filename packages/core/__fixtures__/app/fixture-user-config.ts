import { createStringMarkupIntegration } from '@ecopages/testing';
import { path } from '@ecopages/file-system/path';
import type { EcoPagesUserConfig } from '../../src/config/user-config-types.ts';

export const fixtureRootDir = path.dirname(path.fromFileUrl(import.meta.url));

/** User-owned config shared by `eco.config.ts` and unit tests via {@link createFixtureAppConfig}. */
export function createFixtureUserConfig(overrides: Partial<EcoPagesUserConfig> = {}): EcoPagesUserConfig {
	return {
		rootDir: fixtureRootDir,
		integrations: [createStringMarkupIntegration({ extensions: ['.ts'] })],
		...overrides,
	};
}
