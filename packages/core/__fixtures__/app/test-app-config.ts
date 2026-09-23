import path from 'node:path';
import { createApp, type EcopagesAppOptions } from '../../src/adapters/create-app.ts';
import { finalizeEcoPagesConfig, loadEcoPagesConfig } from '../../src/config/load-eco-config.ts';
import { createFixtureUserConfig, fixtureRootDir } from './fixture-user-config.ts';

export type CreateFixtureAppConfigOptions = {
	/** Loads and finalizes a config module from the fixture directory (for example `eco.config.postcss.ts`). */
	configFile?: string;
};

const defaultConfigFilePath = path.join(fixtureRootDir, 'eco.config.ts');

/**
 * Finalizes the fixture app config for unit tests.
 *
 * @remarks
 * Defaults to in-memory {@link createFixtureUserConfig} so tests avoid disk I/O. Pass `configFile`
 * to exercise the same loader path as `createApp()`.
 */
export async function createFixtureAppConfig(options: CreateFixtureAppConfigOptions = {}) {
	if (options.configFile) {
		return await loadEcoPagesConfig({ cwd: fixtureRootDir, configFile: options.configFile });
	}

	return await finalizeEcoPagesConfig({
		config: createFixtureUserConfig(),
		configFilePath: defaultConfigFilePath,
	});
}

export type CreateFixtureAppOptions = CreateFixtureAppConfigOptions &
	Omit<EcopagesAppOptions, 'appConfig' | 'configFile' | 'userConfig'>;

/** Creates a universal Ecopages app using the fixture config (in-memory or from `configFile`). */
export async function createFixtureApp(options: CreateFixtureAppOptions = {}) {
	const { configFile, ...appOptions } = options;
	if (configFile) {
		return createApp({ ...appOptions, configFile: path.resolve(fixtureRootDir, configFile) });
	}
	return createApp({ ...appOptions, userConfig: createFixtureUserConfig() });
}
