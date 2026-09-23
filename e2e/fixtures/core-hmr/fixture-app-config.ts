import path from 'node:path';
import { createApp, type EcopagesAppOptions } from '@ecopages/core/create-app';
import { finalizeEcoPagesConfig, loadEcoPagesConfig } from '@ecopages/core/config';
import { createCoreHmrUserConfig } from './fixture-user-config.ts';

const fixtureRootDir = import.meta.dirname;
const defaultConfigFilePath = path.join(fixtureRootDir, 'eco.config.ts');

export type CreateCoreHmrAppConfigOptions = {
	configFile?: string;
};

export async function createCoreHmrAppConfig(options: CreateCoreHmrAppConfigOptions = {}) {
	if (options.configFile) {
		return await loadEcoPagesConfig({ cwd: fixtureRootDir, configFile: options.configFile });
	}

	return await finalizeEcoPagesConfig({
		config: createCoreHmrUserConfig(),
		configFilePath: defaultConfigFilePath,
	});
}

export type CreateCoreHmrAppOptions = CreateCoreHmrAppConfigOptions &
	Omit<EcopagesAppOptions, 'appConfig' | 'configFile'>;

export async function createCoreHmrApp(options: CreateCoreHmrAppOptions = {}) {
	const { configFile, ...appOptions } = options;
	const appConfig = await createCoreHmrAppConfig({ configFile });
	return createApp({ ...appOptions, appConfig });
}
