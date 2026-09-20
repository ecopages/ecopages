import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import type postcss from 'postcss';

export type PluginFactoryRecord = Record<string, () => postcss.AcceptedPlugin>;
export type PluginsRecord = Record<string, postcss.AcceptedPlugin>;

const logger = new Logger('[@ecopages/postcss-processor]', {
	debug: process.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

const CONFIG_EXTENSIONS = ['js', 'cjs', 'mjs', 'ts'] as const;

export type LoadedPostcssConfig = {
	pluginFactories?: PluginFactoryRecord;
	plugins?: postcss.AcceptedPlugin[];
};

export function findPostcssConfigPath(rootDir: string): string | undefined {
	for (const ext of CONFIG_EXTENSIONS) {
		const configPath = path.join(rootDir, `postcss.config.${ext}`);
		if (fileSystem.exists(configPath)) {
			return configPath;
		}
	}
	return undefined;
}

function pluginsFromConfigExport(postcssConfig: { plugins?: unknown }): postcss.AcceptedPlugin[] | undefined {
	if (!postcssConfig || typeof postcssConfig.plugins !== 'object' || postcssConfig.plugins === null) {
		return undefined;
	}

	if (Array.isArray(postcssConfig.plugins)) {
		return postcssConfig.plugins;
	}

	return Object.values(postcssConfig.plugins as PluginsRecord);
}

export async function loadPostcssConfigFromFile(configPath: string): Promise<LoadedPostcssConfig> {
	try {
		logger.debug(`Loading PostCSS config from: ${configPath}`);

		const postcssConfigModule = await import(/* @vite-ignore */ configPath);
		const postcssConfig = postcssConfigModule.default || postcssConfigModule;
		const loaded: LoadedPostcssConfig = {};

		if (
			postcssConfig &&
			typeof postcssConfig.pluginFactories === 'object' &&
			postcssConfig.pluginFactories !== null
		) {
			loaded.pluginFactories = postcssConfig.pluginFactories as PluginFactoryRecord;
		}

		const plugins = pluginsFromConfigExport(postcssConfig);
		if (plugins) {
			loaded.plugins = plugins;
			logger.debug(`Successfully loaded ${plugins.length} plugins from config file.`);
		} else {
			logger.warn(`PostCSS config file found (${configPath}), but no valid 'plugins' export detected.`);
		}

		return loaded;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Error loading PostCSS config from ${configPath}: ${message}`, error);
		return {};
	}
}
